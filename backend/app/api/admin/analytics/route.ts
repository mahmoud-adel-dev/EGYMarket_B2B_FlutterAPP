import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import Order from '@/models/Order';
import Organization from '@/models/Organization';
import PaymentObligation from '@/models/PaymentObligation';
import SubscriptionInvoice from '@/models/SubscriptionInvoice';
import User from '@/models/User';

export const dynamic = 'force-dynamic';

const RangeSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .default({});

const MAX_RANGE_DAYS = 180;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function endOfDay(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

export const GET = withAuth(['Admin'], async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const parsed = RangeSchema.safeParse({
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Bad Request', message: 'تنسيق التاريخ غير صحيح' },
      { status: 400 },
    );
  }

  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);

  let fromDate = parsed.data.from ? new Date(`${parsed.data.from}T00:00:00.000Z`) : defaultFrom;
  let toDate = parsed.data.to ? endOfDay(parsed.data.to) : today;
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return NextResponse.json(
      { error: 'Bad Request', message: 'تنسيق التاريخ غير صحيح' },
      { status: 400 },
    );
  }
  if (toDate < fromDate) [fromDate, toDate] = [toDate, fromDate];
  const rangeDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / 86_400_000);
  if (rangeDays > MAX_RANGE_DAYS) {
    return NextResponse.json(
      { error: 'Bad Request', message: 'أقصى نطاق زمني هو 180 يومًا' },
      { status: 400 },
    );
  }

  const rangeMatch = { createdAt: { $gte: fromDate, $lte: toDate } };

  const [
    ordersByDay,
    completedCount,
    canceledCount,
    feesByDay,
    subscriptionRevenueByDay,
    organizationsByDay,
    usersByDay,
    ordersByStatus,
    obligationsByStatus,
  ] = await Promise.all([
    Order.aggregate([
      { $match: rangeMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          gmv: { $sum: '$goods_subtotal_piasters' },
        },
      },
    ]),
    Order.countDocuments({ ...rangeMatch, status: 'completed' }),
    Order.countDocuments({ ...rangeMatch, status: 'canceled' }),
    PaymentObligation.aggregate([
      {
        $match: {
          kind: 'platform_fee',
          status: 'confirmed',
          beneficiary_confirmed_at: { $gte: fromDate, $lte: toDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$beneficiary_confirmed_at' } },
          amount: { $sum: '$amount_piasters' },
        },
      },
    ]),
    SubscriptionInvoice.aggregate([
      {
        $match: { status: 'paid', reviewed_at: { $gte: fromDate, $lte: toDate } },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$reviewed_at' } },
          amount: { $sum: '$amount_piasters' },
        },
      },
    ]),
    Organization.aggregate([{ $match: rangeMatch }, { $group: { _id: dayGroups(), count: { $sum: 1 } } }]),
    User.aggregate([{ $match: rangeMatch }, { $group: { _id: dayGroups(), count: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: rangeMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    PaymentObligation.aggregate([
      { $match: rangeMatch },
      { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount_piasters' } } },
    ]),
  ]);

  function dayGroups() {
    return { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
  }

  const ordersMap = new Map(ordersByDay.map((row) => [row._id as string, row]));
  const feesMap = new Map(feesByDay.map((row) => [row._id as string, row.amount as number]));
  const subscriptionsMap = new Map(
    subscriptionRevenueByDay.map((row) => [row._id as string, row.amount as number]),
  );
  const orgsMap = new Map(organizationsByDay.map((row) => [row._id as string, row.count as number]));
  const usersMap = new Map(usersByDay.map((row) => [row._id as string, row.count as number]));

  const series: Array<{
    date: string;
    label: string;
    orders_created: number;
    gmv_piasters: number;
    platform_fees_confirmed_piasters: number;
    subscription_revenue_piasters: number;
    new_organizations: number;
    new_users: number;
  }> = [];

  const cursor = new Date(fromDate);
  while (cursor <= toDate) {
    const key = dayKey(cursor);
    const orderRow = ordersMap.get(key);
    series.push({
      date: key,
      label: key.slice(5).replace('-', '/'),
      orders_created: orderRow?.count ?? 0,
      gmv_piasters: orderRow?.gmv ?? 0,
      platform_fees_confirmed_piasters: feesMap.get(key) ?? 0,
      subscription_revenue_piasters: subscriptionsMap.get(key) ?? 0,
      new_organizations: orgsMap.get(key) ?? 0,
      new_users: usersMap.get(key) ?? 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const totals = series.reduce(
    (accumulator, point) => ({
      orders_created: accumulator.orders_created + point.orders_created,
      gmv_piasters: accumulator.gmv_piasters + point.gmv_piasters,
      completed_orders: completedCount,
      canceled_orders: canceledCount,
      platform_fees_confirmed_piasters:
        accumulator.platform_fees_confirmed_piasters + point.platform_fees_confirmed_piasters,
      subscription_revenue_paid_piasters:
        accumulator.subscription_revenue_paid_piasters + point.subscription_revenue_piasters,
      new_organizations: accumulator.new_organizations + point.new_organizations,
      new_users: accumulator.new_users + point.new_users,
    }),
    {
      orders_created: 0,
      gmv_piasters: 0,
      completed_orders: 0,
      canceled_orders: 0,
      platform_fees_confirmed_piasters: 0,
      subscription_revenue_paid_piasters: 0,
      new_organizations: 0,
      new_users: 0,
    },
  );

  return NextResponse.json({
    success: true,
    range: { from: dayKey(fromDate), to: dayKey(toDate), days: rangeDays },
    totals,
    series,
    orders_by_status: Object.fromEntries(
      ordersByStatus.map((row) => [row._id as string, row.count as number]),
    ),
    payments_by_state: Object.fromEntries(
      obligationsByStatus.map((row) => [row._id as string, row.count as number]),
    ),
  });
});
