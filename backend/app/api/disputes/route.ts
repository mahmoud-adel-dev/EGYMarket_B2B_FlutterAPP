import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import Dispute from '@/models/Dispute';
import Order from '@/models/Order';

export const GET = withAuth([], async (req, context, session) => {
  let filter: Record<string, unknown> = {};
  if (session.user.role !== 'Admin') {
    const orders = await Order.find({
      $or: [
        { buyer_organization_id: session.user.organizationId },
        { seller_organization_id: session.user.organizationId },
        { shipper_organization_id: session.user.organizationId },
      ],
    }).select('_id');
    filter = { order_id: { $in: orders.map((order) => order._id) } };
  }
  const disputes = await Dispute.find(filter)
    .populate('order_id', 'order_number status')
    .populate('opened_by_organization_id', 'display_name')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  return NextResponse.json({ success: true, disputes });
});
