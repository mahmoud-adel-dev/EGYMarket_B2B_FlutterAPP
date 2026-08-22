import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { withAuth } from '@/lib/auth/withAuth';
import Order from '@/models/Order';
import PaymentObligation from '@/models/PaymentObligation';

export const GET = withAuth([], async (req, context, session) => {
  const params = await context.params;
  const id = params?.id as string;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Bad Request', message: 'Invalid order id' }, { status: 400 });
  }
  const order = await Order.findById(id).lean();
  if (!order) return NextResponse.json({ error: 'Not Found', message: 'Order not found' }, { status: 404 });
  const isBuyer = order.buyer_organization_id.toString() === session.user.organizationId;
  const isSeller = order.seller_organization_id.toString() === session.user.organizationId;
  const isShipper = order.shipper_organization_id?.toString() === session.user.organizationId;
  const related = isBuyer || isSeller || isShipper;
  if (!related && session.user.role !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden', message: 'Access denied' }, { status: 403 });
  }
  const obligations = await PaymentObligation.find({ order_id: id }).sort({ kind: 1 }).lean();
  const visible = session.user.role === 'Admin' || isBuyer
    ? obligations
    : obligations.filter((obligation) =>
        (isSeller && obligation.kind === 'goods') || (isShipper && obligation.kind === 'shipping')
      );
  return NextResponse.json({ success: true, obligations: visible });
});
