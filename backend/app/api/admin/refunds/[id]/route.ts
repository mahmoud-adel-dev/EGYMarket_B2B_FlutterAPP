import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import PaymentObligation from '@/models/PaymentObligation';
import Order from '@/models/Order';
import { writeAuditLog } from '@/lib/audit/audit';

export const dynamic = 'force-dynamic';

const RefundSchema = z.object({ decision: z.literal('mark_refunded') });

/**
 * Operator confirmation that a locally-executed refund finished. Only valid on
 * obligations already parked in `refund_pending` by dispute resolution; the
 * conditional update makes the operation idempotent under double submission.
 */
export const PATCH = withAuth(['Admin'], async (req: NextRequest, context, session) => {
  const params = await context.params;
  const id = params?.id as string;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Bad Request', message: 'Invalid obligation id' }, { status: 400 });
  }
  RefundSchema.parse(await req.json());

  const obligation = await PaymentObligation.findOneAndUpdate(
    { _id: id, status: 'refund_pending' },
    { $set: { status: 'refunded' } },
    { new: true },
  );

  if (!obligation) {
    return NextResponse.json(
      { error: 'Conflict', message: 'هذا الالتزام ليس في قائمة الاسترجاعات المعلّقة' },
      { status: 409 },
    );
  }

  const order = await Order.findById(obligation.order_id).select('order_number').lean();

  await writeAuditLog({
    actorUserId: session.user.id,
    action: 'refund_marked_completed',
    entityType: 'PaymentObligation',
    entityId: id,
    metadata: {
      amount_piasters: obligation.amount_piasters,
      kind: obligation.kind,
      order_number: (order as { order_number?: string } | null)?.order_number,
    },
    ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
    userAgent: req.headers.get('user-agent') ?? undefined,
  });

  return NextResponse.json({ success: true, obligation });
});
