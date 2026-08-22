import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { ApiError } from '@/lib/errors/api_error';
import Dispute from '@/models/Dispute';
import {
  resolveDisputeAsCanceled,
  resolveDisputeAsCompleted,
} from '@/lib/orders/order_service';
import { writeAuditLog } from '@/lib/audit/audit';

const ReviewSchema = z.object({
  decision: z.enum(['in_review', 'resolved', 'rejected']),
  outcome: z.enum(['complete', 'cancel']).default('complete'),
  resolution: z.string().trim().min(5).max(3000),
});

/**
 * Admin dispute review. Final decisions MUST choose the order outcome — this is the
 * only path that exits the `disputed` state, so there is no dead-end anymore.
 */
export const POST = withAuth(['Admin'], async (req: NextRequest, context, session) => {
  const params = await context.params;
  const id = params?.id as string;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, 'Invalid dispute id');
  const data = ReviewSchema.parse(await req.json());
  const actor = { userId: session.user.id, role: 'Admin' };

  if (data.decision === 'in_review') {
    const dispute = await Dispute.findByIdAndUpdate(
      id,
      { $set: { status: 'in_review' } },
      { new: true }
    );
    if (!dispute) return NextResponse.json({ error: 'Not Found', message: 'Dispute not found' }, { status: 404 });
    await writeAuditLog({
      actorUserId: actor.userId,
      action: 'dispute.in_review',
      entityType: 'Dispute',
      entityId: dispute._id,
    });
    return NextResponse.json({ success: true, dispute });
  }

  if (data.outcome === 'cancel') {
    const { dispute, order } = await resolveDisputeAsCanceled(id, data.resolution, actor);
    await writeAuditLog({
      actorUserId: actor.userId,
      action: `dispute.${data.decision}`,
      entityType: 'Dispute',
      entityId: dispute._id,
      metadata: { resolution: data.resolution, order_outcome: 'canceled', order_id: order._id.toString() },
    });
    return NextResponse.json({ success: true, dispute, order_status: order.status });
  }

  const { dispute, order } = await resolveDisputeAsCompleted(id, data.resolution, actor);
  await writeAuditLog({
    actorUserId: actor.userId,
    action: `dispute.${data.decision}`,
    entityType: 'Dispute',
    entityId: dispute._id,
    metadata: { resolution: data.resolution, order_outcome: 'completed', order_id: order._id.toString() },
  });
  return NextResponse.json({ success: true, dispute, order_status: order.status });
});
