import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { withAuth } from '@/lib/auth/withAuth';
import { parsePagination } from '@/lib/api/pagination';
import Order from '@/models/Order';
import PaymentObligation from '@/models/PaymentObligation';
import SubscriptionInvoice from '@/models/SubscriptionInvoice';

export const dynamic = 'force-dynamic';

const MAX_SOURCE_ROWS = 1000;
const OBLIGATION_STATUSES = [
  'pending',
  'proof_submitted',
  'confirmed',
  'rejected',
  'disputed',
  'refund_pending',
  'refunded',
];
const OBLIGATION_KIND_BY_TYPE: Record<string, string> = {
  platform_fee: 'platform_fee',
  order_goods: 'goods',
  order_shipping: 'shipping',
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function endOfDay(value: string): Date {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

export const GET = withAuth(['Admin'], async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const { page, limit, skip } = parsePagination(searchParams);

  const txType = searchParams.get('tx_type');
  const status = searchParams.get('status');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const q = searchParams.get('q')?.trim();

  const wantsObligations =
    !txType || txType === 'platform_fee' || txType === 'order_goods' || txType === 'order_shipping';
  const wantsInvoices = !txType || txType === 'subscription_invoice';

  let matchedOrderIds: mongoose.Types.ObjectId[] | null = null;
  let matchedInvoiceIds: mongoose.Types.ObjectId[] | null = null;
  if (q) {
    const escaped = escapeRegExp(q);
    const [orders, invoices] = await Promise.all([
      Order.find({ order_number: { $regex: escaped, $options: 'i' } }).select('_id').lean(),
      SubscriptionInvoice.find({ invoice_number: { $regex: escaped, $options: 'i' } })
        .select('_id')
        .lean(),
    ]);
    matchedOrderIds = orders.map((order) => order._id as mongoose.Types.ObjectId);
    matchedInvoiceIds = invoices.map((invoice) => invoice._id as mongoose.Types.ObjectId);
  }

  const obligationFilter: Record<string, unknown> = {};
  if (txType && OBLIGATION_KIND_BY_TYPE[txType]) {
    obligationFilter.kind = OBLIGATION_KIND_BY_TYPE[txType];
  }
  if (status && OBLIGATION_STATUSES.includes(status)) obligationFilter.status = status;
  if (from || to) {
    obligationFilter.createdAt = {
      ...(from ? { $gte: new Date(from) } : {}),
      ...(to ? { $lte: endOfDay(to) } : {}),
    };
  }
  if (q) {
    const conditions: Record<string, unknown>[] = [];
    if (matchedOrderIds?.length) conditions.push({ order_id: { $in: matchedOrderIds } });
    conditions.push({ sender_reference: { $regex: escapeRegExp(q), $options: 'i' } });
    obligationFilter.$or = conditions;
  }

  const invoiceFilter: Record<string, unknown> = {};
  if (from || to) {
    invoiceFilter.createdAt = {
      ...(from ? { $gte: new Date(from) } : {}),
      ...(to ? { $lte: endOfDay(to) } : {}),
    };
  }
  if (q) {
    const conditions: Record<string, unknown>[] = [];
    if (matchedInvoiceIds?.length) conditions.push({ _id: { $in: matchedInvoiceIds } });
    conditions.push({ sender_reference: { $regex: escapeRegExp(q), $options: 'i' } });
    invoiceFilter.$or = conditions;
  }

  const [
    obligationRows,
    obligationTotal,
    invoiceRows,
    invoiceTotal,
    confirmedAggregate,
    pendingReviewAggregate,
    refundedAggregate,
    refundPendingAggregate,
    paidInvoicesAggregate,
    pendingInvoicesAggregate,
    feesConfirmedAggregate,
  ] = await Promise.all([
    wantsObligations
      ? PaymentObligation.find(obligationFilter)
          .sort({ createdAt: -1 })
          .limit(MAX_SOURCE_ROWS)
          .populate('payer_organization_id', 'display_name type')
          .populate('beneficiary_organization_id', 'display_name type')
          .populate('order_id', 'order_number')
          .lean()
      : Promise.resolve([] as unknown[]),
    wantsObligations
      ? PaymentObligation.countDocuments(obligationFilter)
      : Promise.resolve(0),
    wantsInvoices
      ? SubscriptionInvoice.find(invoiceFilter)
          .sort({ createdAt: -1 })
          .limit(MAX_SOURCE_ROWS)
          .populate('organization_id', 'display_name type')
          .lean()
      : Promise.resolve([] as unknown[]),
    wantsInvoices
      ? SubscriptionInvoice.countDocuments(invoiceFilter)
      : Promise.resolve(0),
    PaymentObligation.aggregate([
      { $match: { status: 'confirmed' } },
      { $group: { _id: null, amount: { $sum: '$amount_piasters' }, count: { $sum: 1 } } },
    ]),
    PaymentObligation.aggregate([
      { $match: { status: 'proof_submitted' } },
      { $group: { _id: null, amount: { $sum: '$amount_piasters' } } },
    ]),
    PaymentObligation.aggregate([
      { $match: { status: 'refunded' } },
      { $group: { _id: null, amount: { $sum: '$amount_piasters' } } },
    ]),
    PaymentObligation.aggregate([
      { $match: { status: 'refund_pending' } },
      { $group: { _id: null, amount: { $sum: '$amount_piasters' }, count: { $sum: 1 } } },
    ]),
    SubscriptionInvoice.aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: null, amount: { $sum: '$amount_piasters' }, count: { $sum: 1 } } },
    ]),
    SubscriptionInvoice.aggregate([
      { $match: { status: 'proof_submitted' } },
      { $group: { _id: null, amount: { $sum: '$amount_piasters' } } },
    ]),
    PaymentObligation.aggregate([
      { $match: { kind: 'platform_fee', status: 'confirmed' } },
      { $group: { _id: null, amount: { $sum: '$amount_piasters' } } },
    ]),
  ]);

  interface MappedTransaction {
    id: string;
    tx_type: string;
    related_order_id?: string;
    related_order_number?: string;
    related_invoice_number?: string;
    party_name: string;
    party_type: string;
    counterparty_name?: string;
    method?: string;
    reference?: string;
    currency: 'EGP';
    gross_piasters: number;
    status: string;
    created_at: Date;
    settled_at?: Date | null;
  }

  const mappedObligations: MappedTransaction[] = (
    obligationRows as Array<Record<string, unknown>>
  ).map((row) => {
    const payer = row.payer_organization_id as { display_name?: string; type?: string } | null;
    const beneficiary = row.beneficiary_organization_id as { display_name?: string } | null;
    const order = row.order_id as { order_number?: string; _id?: mongoose.Types.ObjectId } | null;
    const kind = row.kind as string;
    return {
      id:
        row._id instanceof mongoose.Types.ObjectId ? row._id.toString() : String(row._id),
      tx_type:
        kind === 'platform_fee'
          ? 'platform_fee'
          : kind === 'shipping'
            ? 'order_shipping'
            : 'order_goods',
      related_order_id:
        order && typeof order === 'object' && order._id
          ? order._id.toString()
          : undefined,
      related_order_number: order && typeof order === 'object' ? order.order_number : undefined,
      party_name: payer?.display_name ?? 'غير معروف',
      party_type: payer?.type ?? '',
      counterparty_name:
        kind === 'platform_fee' ? 'منصة Seals' : beneficiary?.display_name ?? undefined,
      method: (row.payment_method as string) ?? undefined,
      reference: (row.sender_reference as string) ?? undefined,
      currency: 'EGP',
      gross_piasters: row.amount_piasters as number,
      status: row.status as string,
      created_at: row.createdAt as Date,
      settled_at:
        ((row.beneficiary_confirmed_at as Date | undefined) ??
          (row.payer_confirmed_at as Date | undefined)) ?? null,
    };
  });

  const mappedInvoices: MappedTransaction[] = (
    invoiceRows as Array<Record<string, unknown>>
  ).map((row) => {
    const organization = row.organization_id as { display_name?: string; type?: string } | null;
    return {
      id:
        row._id instanceof mongoose.Types.ObjectId ? row._id.toString() : String(row._id),
      tx_type: 'subscription_invoice',
      related_invoice_number: row.invoice_number as string,
      party_name: organization?.display_name ?? 'غير معروف',
      party_type: organization?.type ?? '',
      method: (row.payment_method as string) ?? undefined,
      reference: (row.sender_reference as string) ?? undefined,
      currency: 'EGP',
      gross_piasters: row.amount_piasters as number,
      status: row.status as string,
      created_at: row.createdAt as Date,
      settled_at: (row.reviewed_at as Date | undefined) ?? null,
    };
  });

  const merged = [...mappedObligations, ...mappedInvoices].sort(
    (left, right) => right.created_at.getTime() - left.created_at.getTime(),
  );
  const paged = merged.slice(skip, skip + limit);

  const confirmedAmount = confirmedAggregate[0]?.amount ?? 0;
  const paidInvoiceAmount = paidInvoicesAggregate[0]?.amount ?? 0;
  const feesConfirmed = feesConfirmedAggregate[0]?.amount ?? 0;

  return NextResponse.json({
    success: true,
    overview: {
      currency: 'EGP',
      gross_processed_piasters: confirmedAmount + paidInvoiceAmount,
      pending_review_piasters:
        (pendingReviewAggregate[0]?.amount ?? 0) + (pendingInvoicesAggregate[0]?.amount ?? 0),
      platform_revenue_piasters: feesConfirmed + paidInvoiceAmount,
      order_fees_piasters: feesConfirmed,
      subscription_revenue_piasters: paidInvoiceAmount,
      subscriptions_paid_count: paidInvoicesAggregate[0]?.count ?? 0,
      refunds_piasters: refundedAggregate[0]?.amount ?? 0,
      refund_pending_piasters: refundPendingAggregate[0]?.amount ?? 0,
      refund_pending_count: refundPendingAggregate[0]?.count ?? 0,
      refunds_note:
        'المنصة تعتمد قنوات دفع محلية يدوية؛ تُسجَّل الاسترجاعات كحالات التزامات بعد حل النزاعات.',
    },
    transactions: paged,
    pagination: {
      page,
      limit,
      total: obligationTotal + invoiceTotal,
      total_pages: Math.ceil((obligationTotal + invoiceTotal) / limit),
    },
  });
});
