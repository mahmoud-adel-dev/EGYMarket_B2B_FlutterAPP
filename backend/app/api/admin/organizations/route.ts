import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { withAuth } from '@/lib/auth/withAuth';
import { parsePagination } from '@/lib/api/pagination';
import Organization from '@/models/Organization';
import Order from '@/models/Order';
import Dispute from '@/models/Dispute';

export const dynamic = 'force-dynamic';

const ORGANIZATION_TYPES = ['wholesaler', 'buyer', 'shipper'];
const VERIFICATION_STATUSES = ['unsubmitted', 'pending', 'verified', 'rejected', 'suspended'];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface OrgStats {
  orders_count: number;
  spend_piasters: number;
  sales_piasters: number;
  open_disputes: number;
  last_order_at: Date | null;
}

export const GET = withAuth(['Admin'], async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const { page, limit, skip } = parsePagination(searchParams);

  const q = searchParams.get('q')?.trim();
  const type = searchParams.get('type');
  const verificationStatus = searchParams.get('verification_status');
  const isActive = searchParams.get('is_active');
  const includeStats = searchParams.get('include_stats') === '1';

  const filter: Record<string, unknown> = {};
  if (type && ORGANIZATION_TYPES.includes(type)) filter.type = type;
  if (verificationStatus && VERIFICATION_STATUSES.includes(verificationStatus)) {
    filter.verification_status = verificationStatus;
  }
  if (isActive === 'true' || isActive === 'false') filter.is_active = isActive === 'true';
  if (q) {
    const escaped = escapeRegExp(q);
    filter.$or = [
      { display_name: { $regex: escaped, $options: 'i' } },
      { legal_name: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
      { phone: { $regex: escaped, $options: 'i' } },
    ];
  }

  const [organizations, total] = await Promise.all([
    Organization.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Organization.countDocuments(filter),
  ]);

  let statsByOrg = new Map<string, OrgStats>();

  if (includeStats && organizations.length > 0) {
    statsByOrg = new Map(
      organizations.map((organization) => [
        organization._id.toString(),
        { orders_count: 0, spend_piasters: 0, sales_piasters: 0, open_disputes: 0, last_order_at: null },
      ]),
    );
    const organizationIds = organizations.map((organization) => organization._id);

    const [buyerAgg, sellerAgg, openDisputes] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            buyer_organization_id: { $in: organizationIds },
            status: { $nin: ['canceled', 'rejected'] },
          },
        },
        {
          $group: {
            _id: '$buyer_organization_id',
            count: { $sum: 1 },
            total_piasters: { $sum: '$total_payable_piasters' },
            last_order_at: { $max: '$createdAt' },
          },
        },
      ]),
      Order.aggregate([
        {
          $match: {
            seller_organization_id: { $in: organizationIds },
            status: { $nin: ['canceled', 'rejected'] },
          },
        },
        {
          $group: {
            _id: '$seller_organization_id',
            count: { $sum: 1 },
            total_piasters: { $sum: '$goods_subtotal_piasters' },
            last_order_at: { $max: '$createdAt' },
          },
        },
      ]),
      Dispute.find({ status: { $in: ['open', 'in_review'] } })
        .populate('order_id', 'buyer_organization_id seller_organization_id')
        .lean(),
    ]);

    for (const row of buyerAgg) {
      const entry = statsByOrg.get(row._id?.toString());
      if (!entry) continue;
      entry.orders_count += row.count as number;
      entry.spend_piasters += row.total_piasters as number;
      entry.last_order_at =
        entry.last_order_at && entry.last_order_at > row.last_order_at
          ? entry.last_order_at
          : row.last_order_at ?? entry.last_order_at;
    }
    for (const row of sellerAgg) {
      const entry = statsByOrg.get(row._id?.toString());
      if (!entry) continue;
      entry.orders_count += row.count as number;
      entry.sales_piasters += row.total_piasters as number;
      entry.last_order_at =
        entry.last_order_at && entry.last_order_at > row.last_order_at
          ? entry.last_order_at
          : row.last_order_at ?? entry.last_order_at;
    }
    for (const dispute of openDisputes) {
      const order = dispute.order_id as
        | { buyer_organization_id?: mongoose.Types.ObjectId; seller_organization_id?: mongoose.Types.ObjectId }
        | undefined;
      if (!order || typeof order === 'string') continue;
      for (const key of [
        order.buyer_organization_id?.toString(),
        order.seller_organization_id?.toString(),
      ]) {
        const entry = key ? statsByOrg.get(key) : undefined;
        if (entry) entry.open_disputes += 1;
      }
    }
  }

  return NextResponse.json({
    success: true,
    organizations: organizations.map((organization) => ({
      ...organization,
      stats: includeStats ? statsByOrg.get(organization._id.toString()) : undefined,
    })),
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  });
});
