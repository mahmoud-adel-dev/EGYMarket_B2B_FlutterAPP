import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { ApiError } from '@/lib/errors/api_error';
import Dispute from '@/models/Dispute';
import Order from '@/models/Order';
import { openOrderDispute } from '@/lib/orders/order_service';
import { writeAuditLog } from '@/lib/audit/audit';

const DisputeSchema = z.object({
  reason: z.string().trim().min(10).max(3000),
  evidence_urls: z.array(z.string().url()).max(10).default([]),
});

export const POST = withAuth([], async (req: NextRequest, context, session) => {
  const params = await context.params;
  const id = params?.id as string;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, 'Invalid order id');
  const data = DisputeSchema.parse(await req.json());
  const order = await Order.findById(id);
  if (!order) throw new ApiError(404, 'Order not found', 'NOT_FOUND');

  const organizationId = session.user.organizationId;
  const related = [
    order.buyer_organization_id.toString(),
    order.seller_organization_id.toString(),
    order.shipper_organization_id?.toString(),
  ].includes(organizationId as string);
  if (!related && session.user.role !== 'Admin') {
    throw new ApiError(403, 'Only an order party can open a dispute');
  }

  // Single canonical dispute implementation — same state-machine guards and
  // inventory/obligation side effects as the generic status route.
  const { dispute, order: updated } = await openOrderDispute(
    order,
    { reason: data.reason, evidence_urls: data.evidence_urls },
    { userId: session.user.id, role: session.user.role, organizationId }
  );

  await writeAuditLog({
    actorUserId: session.user.id,
    actorOrganizationId: organizationId,
    action: 'dispute.opened',
    entityType: 'Order',
    entityId: updated._id,
    metadata: { dispute_id: dispute._id.toString() },
  });

  return NextResponse.json({ success: true, dispute }, { status: 201 });
});
