import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import User from '@/models/User';
import Organization from '@/models/Organization';
import Order from '@/models/Order';
import PaymentObligation from '@/models/PaymentObligation';
import Rating from '@/models/Rating';

export const GET = withAuth([], async (req, context, session) => {
  const organizationId = session.user.organizationId;
  const [user, organization, orders, payments, ratings] = await Promise.all([
    User.findById(session.user.id).select('-passwordHash -failed_login_attempts -locked_until').lean(),
    organizationId ? Organization.findById(organizationId).lean() : null,
    organizationId
      ? Order.find({
          $or: [
            { buyer_organization_id: organizationId },
            { seller_organization_id: organizationId },
            { shipper_organization_id: organizationId },
          ],
        })
          .sort({ createdAt: -1 })
          .limit(1000)
          .lean()
      : [],
    organizationId
      ? PaymentObligation.find({
          $or: [
            { payer_organization_id: organizationId },
            { beneficiary_organization_id: organizationId },
          ],
        })
          .sort({ createdAt: -1 })
          .limit(1000)
          .lean()
      : [],
    Rating.find({ user_id: session.user.id }).sort({ createdAt: -1 }).limit(1000).lean(),
  ]);
  return NextResponse.json(
    { exported_at: new Date(), user, organization, orders, payment_obligations: payments, ratings },
    { headers: { 'Content-Disposition': `attachment; filename="seals-data-${session.user.id}.json"` } }
  );
});
