import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { withAuth } from '@/lib/auth/withAuth';
import Order from '@/models/Order';
import PaymentObligation from '@/models/PaymentObligation';
import Dispute from '@/models/Dispute';
import OrderTrackingEvent from '@/models/OrderTrackingEvent';

export const dynamic = 'force-dynamic';

export const GET = withAuth(['Admin'], async (_req: NextRequest, context) => {
  const params = await context.params;
  const id = params?.id as string;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Bad Request', message: 'Invalid order id' }, { status: 400 });
  }

  const order = await Order.findById(id)
    .populate('buyer_organization_id', 'display_name legal_name phone email avatar_url location verification_status')
    .populate('seller_organization_id', 'display_name legal_name phone email avatar_url location verification_status')
    .populate('shipper_organization_id', 'display_name legal_name phone email avatar_url location')
    .populate('created_by', 'name email')
    .lean();
  if (!order) {
    return NextResponse.json({ error: 'Not Found', message: 'Order not found' }, { status: 404 });
  }

  const [obligations, disputes, trackingEvents] = await Promise.all([
    PaymentObligation.find({ order_id: id })
      .sort({ kind: 1 })
      .populate('payer_organization_id', 'display_name type')
      .populate('beneficiary_organization_id', 'display_name type')
      .populate('beneficiary_confirmed_by', 'name')
      .lean(),
    Dispute.find({ order_id: id })
      .sort({ createdAt: -1 })
      .populate('opened_by_user_id', 'name email')
      .populate('resolved_by', 'name')
      .lean(),
    OrderTrackingEvent.find({ order_id: id }).sort({ occurred_at: 1, _id: 1 }).lean(),
  ]);

  const confirmedCount = obligations.filter((item) => item.status === 'confirmed').length;
  const allConfirmed = obligations.length > 0 && confirmedCount === obligations.length;
  const paymentState = obligations.length === 0
    ? 'not_issued'
    : allConfirmed
      ? 'paid'
      : confirmedCount > 0 || obligations.some((item) => item.status === 'proof_submitted')
        ? 'partial'
        : 'pending';

  return NextResponse.json({
    success: true,
    order,
    payment_obligations: obligations,
    payment_summary: {
      state: paymentState,
      confirmed_count: confirmedCount,
      total_count: obligations.length,
    },
    disputes,
    tracking_events: trackingEvents,
  });
});
