import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import DataDeletionRequest from '@/models/DataDeletionRequest';
import User from '@/models/User';
import { writeAuditLog } from '@/lib/audit/audit';

const DeleteSchema = z.object({ password: z.string().min(8), confirmation: z.literal('DELETE') });

export const GET = withAuth([], async (req, context, session) => {
  const deletionRequest = await DataDeletionRequest.findOne({ user_id: session.user.id })
    .sort({ createdAt: -1 })
    .lean();
  return NextResponse.json({ success: true, deletion_request: deletionRequest });
});

export const POST = withAuth([], async (req: NextRequest, context, session) => {
  const data = DeleteSchema.parse(await req.json());
  const user = await User.findById(session.user.id).select('+passwordHash +session_version');
  if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) {
    return NextResponse.json({ error: 'Unauthorized', message: 'Password is incorrect' }, { status: 401 });
  }
  const scheduledFor = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await DataDeletionRequest.findOneAndUpdate(
    { user_id: user._id, status: 'scheduled' },
    {
      $set: { requested_at: new Date(), scheduled_for: scheduledFor },
      $setOnInsert: { user_id: user._id, organization_id: user.organization_id, status: 'scheduled' },
    },
    { upsert: true, new: true }
  );
  user.deletion_requested_at = new Date();
  user.deletion_scheduled_for = scheduledFor;
  user.session_version += 1;
  await user.save();
  await writeAuditLog({
    actorUserId: user._id.toString(),
    actorOrganizationId: user.organization_id?.toString(),
    action: 'account.deletion_requested',
    entityType: 'User',
    entityId: user._id,
    metadata: { scheduled_for: scheduledFor.toISOString() },
  });
  return NextResponse.json({ success: true, message: 'Account deletion scheduled', scheduled_for: scheduledFor });
});

export const DELETE = withAuth([], async (req: NextRequest, context, session) => {
  const data = z.object({ password: z.string().min(8) }).parse(await req.json());
  const user = await User.findById(session.user.id).select('+passwordHash +session_version');
  if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) {
    return NextResponse.json({ error: 'Unauthorized', message: 'Password is incorrect' }, { status: 401 });
  }
  const result = await DataDeletionRequest.findOneAndUpdate(
    { user_id: user._id, status: 'scheduled' },
    { $set: { status: 'canceled' } },
    { new: true }
  );
  if (!result) {
    return NextResponse.json({ error: 'Not Found', message: 'No scheduled deletion request' }, { status: 404 });
  }
  user.deletion_requested_at = undefined;
  user.deletion_scheduled_for = undefined;
  await user.save();
  await writeAuditLog({
    actorUserId: user._id.toString(),
    actorOrganizationId: user.organization_id?.toString(),
    action: 'account.deletion_canceled',
    entityType: 'User',
    entityId: user._id,
  });
  return NextResponse.json({ success: true, message: 'Account deletion canceled' });
});
