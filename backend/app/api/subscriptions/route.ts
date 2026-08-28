import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import connectToDatabase from '@/lib/db/mongoose';
import { withAuth } from '@/lib/auth/withAuth';
import Organization from '@/models/Organization';
import Subscription from '@/models/Subscription';
import SubscriptionInvoice from '@/models/SubscriptionInvoice';
import SubscriptionPlan from '@/models/SubscriptionPlan';

const SubscribeSchema = z.object({
  plan_id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid plan id'),
});

export async function GET(req: NextRequest) {
  await connectToDatabase();
  const organizationType = new URL(req.url).searchParams.get('organization_type');
  const filter: Record<string, unknown> = { is_active: true };
  if (organizationType) filter.organization_types = organizationType;

  const plans = await SubscriptionPlan.find(filter).sort({ sort_order: 1, price_piasters: 1 }).lean();
  return NextResponse.json({ success: true, currency: 'EGP', plans });
}

export const POST = withAuth([], async (req, context, session) => {
  if (!session.user.organizationId) {
    return NextResponse.json({ error: 'Bad Request', message: 'Organization is required' }, { status: 400 });
  }

  const { plan_id } = SubscribeSchema.parse(await req.json());
  const [organization, plan] = await Promise.all([
    Organization.findById(session.user.organizationId),
    SubscriptionPlan.findOne({ _id: plan_id, is_active: true }),
  ]);

  if (!organization || !plan) {
    return NextResponse.json({ error: 'Not Found', message: 'Organization or plan not found' }, { status: 404 });
  }

  // A-1: Only the organization owner or a manager may initiate a (potentially
  // paid) subscription obligation. Plain staff members lack billing authority.
  const memberRole = session.user.organizationMemberRole || session.user.role;
  if (!['owner', 'manager', 'Admin'].includes(memberRole)) {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Only the organization owner or manager can manage subscription billing' },
      { status: 403 }
    );
  }
  if (!plan.organization_types.includes(organization.type)) {
    return NextResponse.json({ error: 'Bad Request', message: 'Plan is not available for this organization type' }, { status: 400 });
  }

  const openInvoice = await SubscriptionInvoice.findOne({
    organization_id: organization._id,
    status: { $in: ['pending', 'proof_submitted'] },
  });
  if (openInvoice) {
    return NextResponse.json(
      { error: 'Conflict', message: 'An unpaid subscription invoice already exists', invoice: openInvoice },
      { status: 409 }
    );
  }

  const subscription = await Subscription.create({
    organization_id: organization._id,
    plan_id: plan._id,
    status: 'pending_payment',
    starts_at: new Date(),
    current_period_ends_at: new Date(),
  });
  const invoice = await SubscriptionInvoice.create({
    invoice_number: `SUB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
    organization_id: organization._id,
    subscription_id: subscription._id,
    plan_id: plan._id,
    amount_piasters: plan.price_piasters,
    currency: 'EGP',
  });

  return NextResponse.json(
    { success: true, message: 'Subscription invoice created', subscription, invoice },
    { status: 201 }
  );
});
