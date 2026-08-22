import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parsePagination } from '@/lib/api/pagination';
import SubscriptionInvoice from '@/models/SubscriptionInvoice';
import Organization from '@/models/Organization';

export const dynamic = 'force-dynamic';

const INVOICE_STATUSES = ['pending', 'proof_submitted', 'paid', 'rejected', 'void'];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const GET = withAuth(['Admin'], async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const { page, limit, skip } = parsePagination(searchParams);

  const q = searchParams.get('q')?.trim();
  const status = searchParams.get('status');

  const filter: Record<string, unknown> = {};
  if (status && INVOICE_STATUSES.includes(status)) filter.status = status;
  if (q) {
    const orConditions: Record<string, unknown>[] = [
      { invoice_number: { $regex: escapeRegExp(q), $options: 'i' } },
    ];
    const organizations = await Organization.find({
      display_name: { $regex: escapeRegExp(q), $options: 'i' },
    })
      .select('_id')
      .lean();
    if (organizations.length > 0) {
      orConditions.push({ organization_id: { $in: organizations.map((organization) => organization._id) } });
    }
    filter.$or = orConditions;
  }

  const [invoices, total] = await Promise.all([
    SubscriptionInvoice.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('organization_id', 'display_name type')
      .populate('plan_id', 'code name_ar price_piasters billing_interval')
      .lean(),
    SubscriptionInvoice.countDocuments(filter),
  ]);

  return NextResponse.json({
    success: true,
    invoices,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  });
});
