import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectToDatabase from '@/lib/db/mongoose';
import { withAuth } from '@/lib/auth/withAuth';
import ShippingRate from '@/models/ShippingRate';
import Organization from '@/models/Organization';
import { hasTradingEntitlement } from '@/lib/subscriptions/entitlements';

const RateSchema = z.object({
  from_governorate: z.string().trim().min(2).max(80),
  to_governorate: z.string().trim().min(2).max(80),
  price_piasters: z.number().int().nonnegative(),
  estimated_days: z.number().int().min(1).max(60),
  is_active: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  await connectToDatabase();
  const params = new URL(req.url).searchParams;
  const filter: Record<string, unknown> = { is_active: true };
  if (params.get('shipper_organization_id')) filter.shipper_organization_id = params.get('shipper_organization_id');
  if (params.get('from')) filter.from_governorate = params.get('from');
  if (params.get('to')) filter.to_governorate = params.get('to');
  const rates = await ShippingRate.find(filter)
    .populate({
      path: 'shipper_organization_id',
      match: { is_active: true, verification_status: 'verified' },
      select: 'display_name avatar_url phone location verification_status',
    })
    .sort({ price_piasters: 1 })
    .limit(200)
    .lean();
  const available = rates.filter((rate) => rate.shipper_organization_id);
  const entitlementChecks = await Promise.all(
    available.map((rate: any) => hasTradingEntitlement(rate.shipper_organization_id._id.toString()))
  );
  return NextResponse.json({
    success: true,
    rates: available.filter((rate, index) => entitlementChecks[index]),
    currency: 'EGP',
  });
}

export const POST = withAuth(['Shipper', 'Admin'], async (req: NextRequest, context, session) => {
  if (!session.user.organizationId) {
    return NextResponse.json({ error: 'Bad Request', message: 'Shipping organization required' }, { status: 400 });
  }
  if (session.user.role !== 'Admin' && !['owner', 'manager'].includes(session.user.organizationMemberRole || '')) {
    return NextResponse.json({ error: 'Forbidden', message: 'Owner or manager access required' }, { status: 403 });
  }
  const data = RateSchema.parse(await req.json());
  const organization = await Organization.findById(session.user.organizationId);
  if (!organization || organization.type !== 'shipper' || organization.verification_status !== 'verified') {
    return NextResponse.json({ error: 'Forbidden', message: 'Verified shipping organization required' }, { status: 403 });
  }
  if (!(await hasTradingEntitlement(organization._id.toString()))) {
    return NextResponse.json({ error: 'Payment Required', message: 'Active subscription required' }, { status: 402 });
  }
  const rate = await ShippingRate.findOneAndUpdate(
    {
      shipper_organization_id: organization._id,
      from_governorate: data.from_governorate,
      to_governorate: data.to_governorate,
    },
    { $set: data },
    { upsert: true, new: true, runValidators: true }
  );
  return NextResponse.json({ success: true, rate }, { status: 201 });
});
