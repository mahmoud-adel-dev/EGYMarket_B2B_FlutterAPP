import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import Dispute from '@/models/Dispute';
import Order from '@/models/Order';
import Organization from '@/models/Organization';
import PaymentObligation from '@/models/PaymentObligation';
import Subscription from '@/models/Subscription';
import SubscriptionInvoice from '@/models/SubscriptionInvoice';
import User from '@/models/User';

export const dynamic = 'force-dynamic';

export const GET = withAuth(['Admin'], async () => {
  const [platformRevenue, subscriptionRevenue, pendingProofs, pendingSubscriptions, pendingVerification, openDisputes, ordersByStatus, organizationsByStatus, activeSubscriptions, trialingSubscriptions, expiredSubscriptions, unpaidInvoices, buyerCount, sellerCount, shipperCount] =
    await Promise.all([
      PaymentObligation.aggregate([
        { $match: { kind: 'platform_fee', status: 'confirmed' } },
        { $group: { _id: null, amount: { $sum: '$amount_piasters' }, count: { $sum: 1 } } },
      ]),
      SubscriptionInvoice.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, amount: { $sum: '$amount_piasters' }, count: { $sum: 1 } } },
      ]),
      PaymentObligation.countDocuments({ status: 'proof_submitted' }),
      SubscriptionInvoice.countDocuments({ status: 'proof_submitted' }),
      Organization.countDocuments({ verification_status: 'pending' }),
      Dispute.countDocuments({ status: { $in: ['open', 'in_review'] } }),
      Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Organization.aggregate([
        { $group: { _id: '$verification_status', count: { $sum: 1 } } },
      ]),
      Subscription.countDocuments({ status: 'active' }),
      Subscription.countDocuments({ status: 'trialing' }),
      Subscription.countDocuments({ status: { $in: ['expired', 'grace_period'] } }),
      SubscriptionInvoice.countDocuments({ status: { $in: ['pending', 'proof_submitted'] } }),
      Organization.countDocuments({ type: 'buyer', is_active: true }),
      Organization.countDocuments({ type: 'wholesaler', is_active: true }),
      Organization.countDocuments({ type: 'shipper', is_active: true }),
    ]);

  return NextResponse.json({
    success: true,
    currency: 'EGP',
    revenue: {
      order_fees_piasters: platformRevenue[0]?.amount || 0,
      order_fees_count: platformRevenue[0]?.count || 0,
      subscriptions_piasters: subscriptionRevenue[0]?.amount || 0,
      subscriptions_count: subscriptionRevenue[0]?.count || 0,
    },
    queues: { pendingProofs, pendingSubscriptions, pendingVerification, openDisputes },
    orders_by_status: Object.fromEntries(ordersByStatus.map((item) => [item._id, item.count])),
    organizations_by_status: Object.fromEntries(
      organizationsByStatus.map((item) => [item._id, item.count]),
    ),
    subscriptions: {
      active: activeSubscriptions,
      trialing: trialingSubscriptions,
      lapsed: expiredSubscriptions,
      unpaid_invoices: unpaidInvoices,
    },
    organizations_active: {
      buyers: buyerCount,
      sellers: sellerCount,
      shippers: shipperCount,
    },
  });
});
