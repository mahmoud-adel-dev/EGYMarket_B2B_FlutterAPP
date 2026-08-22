import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parsePagination } from '@/lib/api/pagination';
import Subscription from '@/models/Subscription';
import Organization from '@/models/Organization';

export const dynamic = 'force-dynamic';

const SUBSCRIPTION_STATUSES = [
  'trialing',
  'pending_payment',
  'under_review',
  'active',
  'grace_period',
  'expired',
  'canceled',
  'rejected',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const GET = withAuth(['Admin'], async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const { page, limit, skip } = parsePagination(searchParams);

  const q = searchParams.get('q')?.trim();
  const status = searchParams.get('status');

  const filter: Record<string, unknown> = {};
  if (status && SUBSCRIPTION_STATUSES.includes(status)) filter.status = status;
  if (q) {
    const organizations = await Organization.find({
      display_name: { $regex: escapeRegExp(q), $options: 'i' },
    })
      .select('_id')
      .lean();
    if (organizations.length === 0) {
      return NextResponse.json({
        success: true,
        subscriptions: [],
        pagination: { page, limit, total: 0, total_pages: 0 },
      });
    }
    filter.organization_id = { $in: organizations.map((organization) => organization._id) };
  }

  const [subscriptions, total] = await Promise.all([
    Subscription.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('organization_id', 'display_name type verification_status is_active')
      .populate('plan_id')
      .lean(),
    Subscription.countDocuments(filter),
  ]);

  return NextResponse.json({
    success: true,
    subscriptions,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  });
});
