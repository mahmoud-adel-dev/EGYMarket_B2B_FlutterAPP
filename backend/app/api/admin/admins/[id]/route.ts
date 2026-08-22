import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import User from '@/models/User';
import { writeAuditLog } from '@/lib/audit/audit';

export const dynamic = 'force-dynamic';

const PatchSchema = z.object({ is_active: z.boolean() });

export const PATCH = withAuth(['Admin'], async (req: NextRequest, context, session) => {
  const params = await context.params;
  const id = params?.id as string;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Bad Request', message: 'Invalid admin id' }, { status: 400 });
  }
  if (id === session.user.id) {
    return NextResponse.json(
      { error: 'Conflict', message: 'لا يمكن تعطيل حسابك الإداري الخاص' },
      { status: 409 },
    );
  }

  const data = PatchSchema.parse(await req.json());
  const admin = await User.findOneAndUpdate(
    { _id: id, role: 'Admin' },
    { $set: { isActive: data.is_active } },
    { new: true },
  ).select('name email role isActive');

  if (!admin) {
    return NextResponse.json(
      { error: 'Not Found', message: 'حساب الإدارة غير موجود' },
      { status: 404 },
    );
  }

  await writeAuditLog({
    actorUserId: session.user.id,
    action: data.is_active ? 'admin_account_activated' : 'admin_account_deactivated',
    entityType: 'User',
    entityId: id,
    metadata: { target_email: admin.email, is_active: data.is_active },
    ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
    userAgent: req.headers.get('user-agent') ?? undefined,
  });

  return NextResponse.json({ success: true, admin });
});
