import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import type { PipelineStage } from 'mongoose';
import { withAuth } from '@/lib/auth/withAuth';
import { parsePagination } from '@/lib/api/pagination';
import Order from '@/models/Order';
import Organization from '@/models/Organization';
import PaymentObligation from '@/models/PaymentObligation';

export const dynamic = 'force-dynamic';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function endOfDay(value: string): Date {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

/** Absent/blank query params must stay undefined — Number(null) is 0, not NaN. */
function parseOptionalAmount(value: string | null): number {
  if (value === null || value.trim() === '') return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

const PAYMENT_STATE_EXPRESSION: Record<string, string> = {
  paid: 'paid',
  partial: 'partial',
  pending: 'pending',
  not_issued: 'not_issued',
};

export const GET = withAuth(['Admin'], async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const { page, limit, skip } = parsePagination(searchParams);

  const q = searchParams.get('q')?.trim();
  const status = searchParams.get('status');
  const paymentState = searchParams.get('payment_state');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const minTotal = parseOptionalAmount(searchParams.get('min_total_piasters'));
  const maxTotal = parseOptionalAmount(searchParams.get('max_total_piasters'));
  const sortKey = searchParams.get('sort') === 'total' ? 'total_payable_piasters' : 'createdAt';
  const sortDir = searchParams.get('dir') === 'asc' ? 1 : -1;

  const match: Record<string, unknown> = {};
  if (status) match.status = status;
  if (from || to) {
    match.createdAt = {
      ...(from ? { $gte: new Date(from) } : {}),
      ...(to ? { $lte: endOfDay(to) } : {}),
    };
  }
  if (Number.isFinite(minTotal) || Number.isFinite(maxTotal)) {
    match.total_payable_piasters = {
      ...(Number.isFinite(minTotal) ? { $gte: minTotal } : {}),
      ...(Number.isFinite(maxTotal) ? { $lte: maxTotal } : {}),
    };
  }
  if (q) {
    const escaped = escapeRegExp(q);
    const organizations = await Organization.find({
      $or: [
        { display_name: { $regex: escaped, $options: 'i' } },
        { legal_name: { $regex: escaped, $options: 'i' } },
      ],
    })
      .select('_id')
      .lean();
    const organizationIds = organizations.map((organization) => organization._id);
    match.$or = [
      { order_number: { $regex: escaped, $options: 'i' } },
      ...(organizationIds.length
        ? [
            { buyer_organization_id: { $in: organizationIds } },
            { seller_organization_id: { $in: organizationIds } },
            { shipper_organization_id: { $in: organizationIds } },
          ]
        : []),
    ];
  }

  const orgLookup = (field: string) => ({
    $lookup: {
      from: 'organizations',
      localField: field,
      foreignField: '_id',
      as: field,
      pipeline: [{ $project: { display_name: 1, avatar_url: 1, 'location.governorate': 1 } }],
    },
  });

  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $lookup: {
        from: 'paymentobligations',
        localField: '_id',
        foreignField: 'order_id',
        as: 'obligations',
        pipeline: [{ $project: { status: 1, amount_piasters: 1, kind: 1 } }],
      },
    },
    {
      $addFields: {
        confirmed_count: {
          $size: {
            $filter: {
              input: '$obligations',
              cond: { $eq: ['$$this.status', 'confirmed'] },
            },
          },
        },
        total_count: { $size: '$obligations' },
      },
    },
    {
      $addFields: {
        payment_state: {
          $switch: {
            branches: [
              { case: { $eq: ['$total_count', 0] }, then: 'not_issued' },
              {
                case: { $eq: ['$confirmed_count', '$total_count'] },
                then: 'paid',
              },
              {
                case: {
                  $or: [
                    { $gt: ['$confirmed_count', 0] },
                    {
                      $gt: [
                        {
                          $size: {
                            $filter: {
                              input: '$obligations',
                              cond: { $eq: ['$$this.status', 'proof_submitted'] },
                            },
                          },
                        },
                        0,
                      ],
                    },
                  ],
                },
                then: 'partial',
              },
            ],
            default: 'pending',
          },
        },
      },
    },
    ...(paymentState && PAYMENT_STATE_EXPRESSION[paymentState]
      ? [{ $match: { payment_state: paymentState } }]
      : []),
    {
      $facet: {
        rows: [
          { $sort: { [sortKey]: sortDir } },
          { $skip: skip },
          { $limit: limit },
          orgLookup('buyer_organization_id'),
          orgLookup('seller_organization_id'),
          orgLookup('shipper_organization_id'),
          {
            $project: {
              _id: 1,
              order_number: 1,
              status: 1,
              fulfillment_method: 1,
              goods_subtotal_piasters: 1,
              shipping_cost_piasters: 1,
              platform_fee_piasters: 1,
              total_payable_piasters: 1,
              createdAt: 1,
              buyer_organization_id: { $arrayElemAt: ['$buyer_organization_id', 0] },
              seller_organization_id: { $arrayElemAt: ['$seller_organization_id', 0] },
              shipper_organization_id: { $arrayElemAt: ['$shipper_organization_id', 0] },
              payment_summary: {
                state: '$payment_state',
                confirmed_count: '$confirmed_count',
                total_count: '$total_count',
              },
            },
          },
        ],
        total: [{ $count: 'value' }],
      },
    },
  ];

  const [result] = await Order.aggregate(pipeline);
  const total = result?.total?.[0]?.value ?? 0;

  return NextResponse.json({
    success: true,
    orders: result?.rows ?? [],
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  });
});
