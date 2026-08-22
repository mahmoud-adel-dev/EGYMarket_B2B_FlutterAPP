import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import PaymentObligation from '@/models/PaymentObligation';
import Order, { IOrder } from '@/models/Order';
import { syncOrderPaymentState } from '@/lib/orders/order_service';
import { createOrganizationNotification } from '@/lib/notifications/notification_service';
import { appendOrderSystemEvent, unlockBuyerOrderChat } from '@/lib/orders/order_chat';

const ReviewSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('confirm') }),
  z.object({ decision: z.literal('reject'), rejection_reason: z.string().trim().min(3).max(1000) }),
]);

export const POST = withAuth([], async (req: NextRequest, context, session) => {
  const params = await context.params;
  const orderId = params?.id as string;
  const paymentId = params?.paymentId as string;
  if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(paymentId)) {
    return NextResponse.json({ error: 'Bad Request', message: 'Invalid id' }, { status: 400 });
  }
  const data = ReviewSchema.parse(await req.json());
  const candidate = await PaymentObligation.findOne({
    _id: paymentId,
    order_id: orderId,
    status: 'proof_submitted',
  }).lean();
  if (!candidate) {
    return NextResponse.json({ error: 'Not Found', message: 'Payment proof awaiting review not found' }, { status: 404 });
  }
  const allowed = candidate.beneficiary_type === 'platform'
    ? session.user.role === 'Admin'
    : candidate.beneficiary_organization_id?.toString() === session.user.organizationId &&
      ['owner', 'manager'].includes(session.user.organizationMemberRole || '');
  if (!allowed) return NextResponse.json({ error: 'Forbidden', message: 'Only the beneficiary can review this payment' }, { status: 403 });

  // Conditional update is the race gate: concurrent confirm/reject requests have
  // exactly one winner and therefore emit one unlock/event only.
  const obligation = await PaymentObligation.findOneAndUpdate(
    { _id: paymentId, order_id: orderId, status: 'proof_submitted' },
    data.decision === 'reject'
      ? {
          $set: { status: 'rejected', rejection_reason: data.rejection_reason },
          $unset: { beneficiary_confirmed_at: 1, beneficiary_confirmed_by: 1 },
        }
      : {
          $set: {
            status: 'confirmed',
            beneficiary_confirmed_at: new Date(),
            beneficiary_confirmed_by: new mongoose.Types.ObjectId(session.user.id),
          },
          $unset: { rejection_reason: 1 },
        },
    { new: true }
  );
  if (!obligation) {
    return NextResponse.json({ error: 'Conflict', message: 'This payment proof was already reviewed' }, { status: 409 });
  }

  let order: IOrder | null = await Order.findById(orderId);
  if (!order) return NextResponse.json({ error: 'Not Found', message: 'Order not found' }, { status: 404 });
  const previousOrderStatus = order.status;
  if (data.decision === 'confirm') {
    if (obligation.kind === 'platform_fee') {
      order = (await unlockBuyerOrderChat(orderId)).order;
    }
    const synced = await syncOrderPaymentState(orderId, session.user.id, session.user.role, session.user.organizationId);
    if (synced) order = synced;
  }
  const kindLabel = obligation.kind === 'platform_fee'
    ? 'رسوم المنصة'
    : obligation.kind === 'goods'
      ? 'قيمة البضاعة'
      : 'قيمة الشحن';
  await appendOrderSystemEvent({
    order,
    body: data.decision === 'confirm'
      ? `تم تأكيد استلام ${kindLabel}`
      : `تم رفض إثبات ${kindLabel}: ${data.rejection_reason}`,
    eventType: data.decision === 'confirm' ? 'payment_confirmed' : 'payment_rejected',
    actorUserId: session.user.id,
    actorOrganizationId: session.user.organizationId,
    metadata: {
      obligation_id: obligation._id.toString(),
      kind: obligation.kind,
      amount_piasters: obligation.amount_piasters,
      status: obligation.status,
    },
  });
  if (previousOrderStatus === 'awaiting_payments' && order.status === 'preparing') {
    await appendOrderSystemEvent({
      order,
      body: 'اكتملت جميع المدفوعات وأصبح الطلب مؤكدًا وجاري التجهيز',
      eventType: 'all_payments_confirmed',
      actorUserId: session.user.id,
      actorOrganizationId: session.user.organizationId,
      metadata: { status: order.status },
    });
  }
  createOrganizationNotification(obligation.payer_organization_id, {
    type: data.decision === 'confirm' ? 'payment_confirmed' : 'payment_rejected',
    title: data.decision === 'confirm' ? 'تم تأكيد الدفع' : 'تم رفض إثبات الدفع',
    body: data.decision === 'confirm' ? 'أكد المستفيد استلام المبلغ' : data.rejection_reason,
    orderId,
  }).catch(() => {});
  return NextResponse.json({ success: true, obligation });
});
