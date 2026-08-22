import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import Subscription from '@/models/Subscription';
import SubscriptionInvoice from '@/models/SubscriptionInvoice';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import { writeAuditLog } from '@/lib/audit/audit';

const ReviewSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve') }),
  z.object({ decision: z.literal('reject'), rejection_reason: z.string().trim().min(3).max(500) }),
]);

export const POST = withAuth(['Admin'], async (req: NextRequest, context, session) => {
  const params = await context.params;
  const id = params?.id as string;
  const data = ReviewSchema.parse(await req.json());
  const invoice = await SubscriptionInvoice.findOne({ _id: id, status: 'proof_submitted' });
  if (!invoice) {
    return NextResponse.json({ error: 'Not Found', message: 'Invoice awaiting review not found' }, { status: 404 });
  }

  invoice.reviewed_at = new Date();
  invoice.reviewed_by = session.user.id as never;
  if (data.decision === 'reject') {
    invoice.status = 'rejected';
    invoice.rejection_reason = data.rejection_reason;
    await invoice.save();
    await Subscription.findByIdAndUpdate(invoice.subscription_id, { status: 'rejected' });
    await writeAuditLog({
      actorUserId: session.user.id,
      action: 'subscription_invoice_rejected',
      entityType: 'SubscriptionInvoice',
      entityId: id,
      metadata: { invoice_number: invoice.invoice_number, rejection_reason: data.rejection_reason },
      ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: req.headers.get('user-agent') ?? undefined,
    });
    return NextResponse.json({ success: true, invoice });
  }

  const plan = await SubscriptionPlan.findById(invoice.plan_id);
  if (!plan) {
    return NextResponse.json({ error: 'Conflict', message: 'Subscription plan no longer exists' }, { status: 409 });
  }
  const startsAt = new Date();
  const periodEndsAt = new Date(startsAt);
  if (plan.billing_interval === 'yearly') periodEndsAt.setFullYear(periodEndsAt.getFullYear() + 1);
  else periodEndsAt.setMonth(periodEndsAt.getMonth() + 1);

  invoice.status = 'paid';
  invoice.rejection_reason = undefined;
  await invoice.save();
  await Subscription.findByIdAndUpdate(invoice.subscription_id, {
    status: 'active',
    starts_at: startsAt,
    current_period_ends_at: periodEndsAt,
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    action: 'subscription_invoice_approved',
    entityType: 'SubscriptionInvoice',
    entityId: id,
    metadata: {
      invoice_number: invoice.invoice_number,
      amount_piasters: invoice.amount_piasters,
      plan_code: plan.code,
    },
    ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
    userAgent: req.headers.get('user-agent') ?? undefined,
  });

  return NextResponse.json({ success: true, message: 'Subscription activated', invoice });
});
