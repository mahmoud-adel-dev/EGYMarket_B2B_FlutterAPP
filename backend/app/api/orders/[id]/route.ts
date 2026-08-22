import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getCanonicalOrderDetail } from '@/lib/orders/order_detail_dto';

export const GET = withAuth([], async (_req, context, session) => {
  const params = await context.params;
  const orderId = params?.id as string;
  const detail = await getCanonicalOrderDetail(orderId, session);
  return NextResponse.json({ success: true, ...detail });
});
