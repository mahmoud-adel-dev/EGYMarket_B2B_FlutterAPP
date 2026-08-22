'use server';

import mongoose from 'mongoose';
import { revalidatePath } from 'next/cache';
import { requireAdminPage } from '@/lib/auth/require_admin';
import Organization from '@/models/Organization';
import Subscription from '@/models/Subscription';
import SubscriptionInvoice from '@/models/SubscriptionInvoice';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import PaymentObligation from '@/models/PaymentObligation';
import PlatformSettings from '@/models/PlatformSettings';
import Dispute from '@/models/Dispute';
import Order, { IOrder } from '@/models/Order';
import { syncOrderPaymentState, resolveDisputeAsCompleted, resolveDisputeAsCanceled } from '@/lib/orders/order_service';
import { writeAuditLog } from '@/lib/audit/audit';
import { appendOrderSystemEvent, unlockBuyerOrderChat } from '@/lib/orders/order_chat';
import { createOrganizationNotification } from '@/lib/notifications/notification_service';

export async function reviewOrganizationAction(formData: FormData) {
  const { user } = await requireAdminPage();
  const id = String(formData.get('id'));
  const decision = String(formData.get('decision'));
  const organization = await Organization.findById(id);
  if (!organization || !['approve', 'reject', 'suspend'].includes(decision)) return;
  const approved = decision === 'approve';
  organization.verification_status = approved ? 'verified' : decision === 'suspend' ? 'suspended' : 'rejected';
  for (const document of organization.verification_documents) {
    document.status = approved ? 'approved' : 'rejected';
    document.reviewed_at = new Date();
    document.reviewed_by = user._id;
    document.rejection_reason = approved ? undefined : 'راجع المستندات وتواصل مع الدعم';
  }
  await organization.save();
  await writeAuditLog({ actorUserId: user._id.toString(), action: `organization.${decision}`, entityType: 'Organization', entityId: organization._id });
  revalidatePath('/admin');
}

export async function reviewSubscriptionAction(formData: FormData) {
  const { user } = await requireAdminPage();
  const invoice = await SubscriptionInvoice.findById(String(formData.get('id')));
  const decision = String(formData.get('decision'));
  if (!invoice || invoice.status !== 'proof_submitted') return;
  invoice.reviewed_at = new Date();
  invoice.reviewed_by = user._id;
  if (decision === 'approve') {
    const plan = await SubscriptionPlan.findById(invoice.plan_id);
    if (!plan) return;
    const end = new Date();
    if (plan.billing_interval === 'yearly') end.setFullYear(end.getFullYear() + 1);
    else end.setMonth(end.getMonth() + 1);
    invoice.status = 'paid';
    await Subscription.findByIdAndUpdate(invoice.subscription_id, {
      status: 'active', starts_at: new Date(), current_period_ends_at: end,
    });
  } else {
    invoice.status = 'rejected';
    invoice.rejection_reason = 'بيانات التحويل غير مطابقة';
    await Subscription.findByIdAndUpdate(invoice.subscription_id, { status: 'rejected' });
  }
  await invoice.save();
  await writeAuditLog({ actorUserId: user._id.toString(), action: `subscription.${decision}`, entityType: 'SubscriptionInvoice', entityId: invoice._id });
  revalidatePath('/admin');
}

export async function reviewPlatformPaymentAction(formData: FormData) {
  const { user } = await requireAdminPage();
  const decision = String(formData.get('decision'));
  if (!['confirm', 'reject'].includes(decision)) return;
  const payment = await PaymentObligation.findOneAndUpdate(
    { _id: String(formData.get('id')), kind: 'platform_fee', status: 'proof_submitted' },
    decision === 'confirm'
      ? {
          $set: { status: 'confirmed', beneficiary_confirmed_at: new Date(), beneficiary_confirmed_by: user._id },
          $unset: { rejection_reason: 1 },
        }
      : { $set: { status: 'rejected', rejection_reason: 'بيانات التحويل غير مطابقة' } },
    { new: true }
  );
  if (!payment) return;
  let order: IOrder | null = await Order.findById(payment.order_id);
  if (!order) return;
  const previousStatus = order.status;
  if (decision === 'confirm') {
    order = (await unlockBuyerOrderChat(payment.order_id)).order;
    const synced = await syncOrderPaymentState(payment.order_id.toString(), user._id.toString(), 'Admin');
    if (synced) order = synced;
  }
  await appendOrderSystemEvent({
    order,
    body: decision === 'confirm' ? 'أكدت المنصة استلام رسوم الطلب' : 'رفضت المنصة إثبات رسوم الطلب',
    eventType: decision === 'confirm' ? 'payment_confirmed' : 'payment_rejected',
    actorUserId: user._id.toString(),
    metadata: {
      obligation_id: payment._id.toString(),
      kind: payment.kind,
      amount_piasters: payment.amount_piasters,
      status: payment.status,
    },
  });
  if (previousStatus === 'awaiting_payments' && order.status === 'preparing') {
    await appendOrderSystemEvent({
      order,
      body: 'اكتملت جميع المدفوعات وأصبح الطلب مؤكدًا وجاري التجهيز',
      eventType: 'all_payments_confirmed',
      actorUserId: user._id.toString(),
      metadata: { status: order.status },
    });
  }
  await createOrganizationNotification(payment.payer_organization_id, {
    type: decision === 'confirm' ? 'payment_confirmed' : 'payment_rejected',
    title: decision === 'confirm' ? 'تم تأكيد رسوم المنصة' : 'تم رفض إثبات رسوم المنصة',
    body: decision === 'confirm' ? 'تم فتح متابعة الطلب والمحادثة الخاصة.' : 'راجع بيانات التحويل وأعد رفع الإثبات.',
    orderId: payment.order_id,
  });
  await writeAuditLog({ actorUserId: user._id.toString(), action: `platform_payment.${decision}`, entityType: 'PaymentObligation', entityId: payment._id });
  revalidatePath('/admin');
}

/**
 * Dispute resolution is the ONLY path that moves an order out of `disputed`.
 * The admin must pick an outcome: uphold the transaction (order completes,
 * inventory commits, frozen obligations restore to confirmed) or unwind it
 * (order cancels, reserved stock releases, obligations become refund_pending).
 */
export async function reviewDisputeAction(formData: FormData) {
  const { user } = await requireAdminPage();
  const id = String(formData.get('id'));
  const decision = String(formData.get('decision')) as 'in_review' | 'resolved' | 'rejected';
  const outcome = String(formData.get('outcome') || '');
  const resolution = String(formData.get('resolution') || '').trim() || 'تمت المراجعة بواسطة الإدارة';
  if (!['in_review', 'resolved', 'rejected'].includes(decision)) return;

  const actor = {
    userId: user._id.toString(),
    role: 'Admin',
  };

  if (decision === 'in_review') {
    await Dispute.updateOne(
      { _id: id, status: 'open' },
      { $set: { status: 'in_review' } }
    );
    await writeAuditLog({ actorUserId: actor.userId, action: 'dispute.in_review', entityType: 'Dispute', entityId: id });
    revalidatePath('/admin');
    return;
  }

  // Both final decisions must choose what happens to the order itself.
  if (outcome !== 'complete' && outcome !== 'cancel') return;
  if (outcome === 'complete') {
    const result = await resolveDisputeAsCompleted(id, resolution, actor);
    await writeAuditLog({
      actorUserId: actor.userId, action: `dispute.${decision}`, entityType: 'Dispute', entityId: id,
      metadata: { resolution, order_outcome: 'completed', order_id: result.order._id.toString() },
    });
  } else {
    const result = await resolveDisputeAsCanceled(id, resolution, actor);
    await writeAuditLog({
      actorUserId: actor.userId, action: `dispute.${decision}`, entityType: 'Dispute', entityId: id,
      metadata: { resolution, order_outcome: 'canceled', order_id: result.order._id.toString() },
    });
  }
  revalidatePath('/admin');
}

export async function savePlatformSettingsAction(formData: FormData) {
  const { user } = await requireAdminPage();
  const feePiasters = Math.round(Number(formData.get('order_fee_egp')) * 100);
  const reference = String(formData.get('account_reference') || '').trim();
  const holder = String(formData.get('account_holder') || '').trim();
  const method = String(formData.get('method') || 'instapay');
  const paymentDeadlineHours = Math.min(Math.max(Number(formData.get('payment_deadline_hours')) || 48, 1), 720);
  await PlatformSettings.findOneAndUpdate(
    { key: 'default' },
    {
      $set: {
        order_fee_piasters: Number.isFinite(feePiasters) ? feePiasters : 5000,
        payment_deadline_hours: paymentDeadlineHours,
        platform_payment_accounts: reference && holder ? [{ method, label: 'حساب المنصة', account_holder: holder, account_reference: reference, is_active: true }] : [],
      },
      $setOnInsert: { key: 'default' },
    },
    { upsert: true, new: true, runValidators: true }
  );
  await writeAuditLog({ actorUserId: user._id.toString(), action: 'platform_settings.updated', entityType: 'PlatformSettings' });
  revalidatePath('/admin/settings');
}

export async function createPlanAction(formData: FormData) {
  const { user } = await requireAdminPage();
  const pricePiasters = Math.round(Number(formData.get('price_egp')) * 100);
  const organizationTypes = String(formData.get('organization_types') || '')
    .split(',').map((value) => value.trim()).filter((value) => ['wholesaler', 'buyer', 'shipper'].includes(value));
  const plan = await SubscriptionPlan.create({
    code: String(formData.get('code')).trim().toLowerCase(),
    name_ar: String(formData.get('name_ar')).trim(),
    name_en: String(formData.get('name_en')).trim(),
    price_piasters: pricePiasters,
    billing_interval: String(formData.get('billing_interval')),
    organization_types: organizationTypes,
    features: [],
    is_active: true,
  });
  await writeAuditLog({ actorUserId: user._id.toString(), action: 'subscription_plan.created', entityType: 'SubscriptionPlan', entityId: plan._id, metadata: { code: plan.code } });
  revalidatePath('/admin/settings');
}
