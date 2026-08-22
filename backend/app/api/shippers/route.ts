import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db/mongoose';
import Organization from '@/models/Organization';
import ShippingRate from '@/models/ShippingRate';
import { hasTradingEntitlement } from '@/lib/subscriptions/entitlements';

export async function GET(req: NextRequest) {
  await connectToDatabase();
  const params = new URL(req.url).searchParams;
  const from = params.get('from');
  const to = params.get('to');
  const rateFilter: Record<string, unknown> = { is_active: true };
  if (from) rateFilter.from_governorate = from;
  if (to) rateFilter.to_governorate = to;
  const rates = await ShippingRate.find(rateFilter).sort({ price_piasters: 1 }).limit(200).lean();
  const ids = rates.map((rate) => rate.shipper_organization_id);
  const organizations = await Organization.find({
    _id: { $in: ids },
    type: 'shipper',
    verification_status: 'verified',
    is_active: true,
  })
    .select('display_name avatar_url phone location')
    .lean();
  const organizationMap = new Map(organizations.map((organization) => [organization._id.toString(), organization]));
  const candidates = rates
    .filter((rate) => organizationMap.has(rate.shipper_organization_id.toString()))
    .map((rate) => ({
      organization: organizationMap.get(rate.shipper_organization_id.toString()),
      rate,
    }));
  const entitlements = await Promise.all(
    candidates.map((item) => hasTradingEntitlement(item.rate.shipper_organization_id.toString()))
  );
  const shippers = candidates.filter((item, index) => entitlements[index]);
  return NextResponse.json({ success: true, shippers, currency: 'EGP' });
}
