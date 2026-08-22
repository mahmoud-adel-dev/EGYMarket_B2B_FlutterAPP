import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import Subscription from '@/models/Subscription';
import SubscriptionInvoice from '@/models/SubscriptionInvoice';

export const GET = withAuth([], async (req, context, session) => {
  if (!session.user.organizationId) {
    return NextResponse.json({ success: true, subscription: null, invoices: [] });
  }

  const [subscription, invoices] = await Promise.all([
    Subscription.findOne({ organization_id: session.user.organizationId })
      .sort({ createdAt: -1 })
      .populate('plan_id')
      .lean(),
    SubscriptionInvoice.find({ organization_id: session.user.organizationId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
  ]);
  return NextResponse.json({ success: true, subscription, invoices });
});
