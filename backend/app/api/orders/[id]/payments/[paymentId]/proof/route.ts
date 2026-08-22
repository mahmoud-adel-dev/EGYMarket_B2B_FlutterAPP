import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { withAuth } from '@/lib/auth/withAuth';
import { SubmitPaymentProofSchema } from '@/lib/validation/payment';
import PaymentObligation from '@/models/PaymentObligation';
import Order from '@/models/Order';
import { createOrganizationNotification } from '@/lib/notifications/notification_service';
import { appendOrderSystemEvent } from '@/lib/orders/order_chat';

export const POST = withAuth([], async (req: NextRequest, context, session) => {
  const params = await context.params;
  const orderId = params?.id as string;
  const paymentId = params?.paymentId as string;
  if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(paymentId)) {
    return NextResponse.json({ error: 'Bad Request', message: 'Invalid id' }, { status: 400 });
  }
  const data = SubmitPaymentProofSchema.parse(await req.json());
  if (!['owner', 'manager'].includes(session.user.organizationMemberRole || '')) {
    return NextResponse.json(
      { error: 'ORG_PERMISSION_REQUIRED', message: 'Only an organization owner or manager can submit payments' },
      { status: 403 }
    );
  }

  // Proofs are meaningful only while the order still awaits payment.
  const order = await Order.findById(orderId);
  if (!order || order.buyer_organization_id.toString() !== session.user.organizationId) {
    return NextResponse.json({ error: 'Not Found', message: 'Payable obligation not found' }, { status: 404 });
  }
  if (order.status !== 'awaiting_payments') {
    return NextResponse.json(
      { error: 'Conflict', message: 'This order is no longer awaiting payment' },
      { status: 409 }
    );
  }
  if (order.payment_due_at && order.payment_due_at.getTime() < Date.now()) {
    return NextResponse.json(
      { error: 'Gone', message: 'The payment deadline for this order has expired' },
      { status: 410 }
    );
  }

  // Atomic claim: only one submission can flip a pending/rejected obligation.
  const obligation = await PaymentObligation.findOneAndUpdate(
    {
      _id: paymentId,
      order_id: orderId,
      payer_organization_id: session.user.organizationId,
      status: { $in: ['pending', 'rejected'] },
    },
    {
      $set: {
        payment_method: data.payment_method,
        sender_reference: data.sender_reference,
        proof_url: data.proof_url,
        payer_note: data.note,
        payer_confirmed_at: new Date(),
        status: 'proof_submitted',
      },
      $unset: { rejection_reason: 1 },
    },
    { new: true }
  );
  if (!obligation) {
    return NextResponse.json({ error: 'Not Found', message: 'Payable obligation not found' }, { status: 404 });
  }

  const accounts = ((obligation.payment_account_snapshot as Record<string, unknown>)?.accounts || []) as Array<{ method: string }>;
  if (!accounts.some((account) => account.method === data.payment_method)) {
    // Method not accepted by beneficiary: undo the claim and inform the caller.
    await PaymentObligation.updateOne(
      { _id: obligation._id, status: 'proof_submitted' },
      {
        $set: { status: 'pending' },
        $unset: { sender_reference: 1, proof_url: 1, payer_note: 1, payer_confirmed_at: 1 },
      }
    );
    return NextResponse.json({ error: 'Bad Request', message: 'Payment method is not accepted by beneficiary' }, { status: 400 });
  }

  if (obligation.beneficiary_organization_id) {
    createOrganizationNotification(obligation.beneficiary_organization_id, {
      type: 'payment_proof_submitted',
      title: 'إثبات تحويل جديد',
      body: 'أرسل المشتري إثبات دفع ويحتاج إلى المراجعة',
      orderId,
    }).catch(() => {});
  }
  await appendOrderSystemEvent({
    order,
    body: `أرسل المشتري إثبات تحويل ${paymentKindLabel(obligation.kind)} للمراجعة`,
    eventType: 'payment_proof_submitted',
    actorUserId: session.user.id,
    actorOrganizationId: session.user.organizationId,
    metadata: {
      obligation_id: obligation._id.toString(),
      kind: obligation.kind,
      amount_piasters: obligation.amount_piasters,
      status: obligation.status,
    },
  });
  return NextResponse.json({ success: true, message: 'Payment proof submitted', obligation });
});

function paymentKindLabel(kind: string) {
  if (kind === 'platform_fee') return 'رسوم المنصة';
  if (kind === 'goods') return 'قيمة البضاعة';
  return 'قيمة الشحن';
}
