import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import Notification from '@/models/Notification';

export const PATCH = withAuth([], async (req, context, session) => {
  await Notification.updateMany(
    { recipient_id: session.user.id, is_read: false },
    { $set: { is_read: true, readAt: new Date() } }
  );
  return NextResponse.json({ success: true, message: 'All notifications marked as read' });
});
