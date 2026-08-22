import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import User from '@/models/User';

export const dynamic = 'force-dynamic';

export const GET = withAuth(['Admin'], async () => {
  const admins = await User.find({ role: 'Admin' })
    .select('name email role isActive email_verified_at createdAt updatedAt')
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ success: true, admins });
});
