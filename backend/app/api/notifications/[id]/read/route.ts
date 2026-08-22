import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db/mongoose';
import Notification from '@/models/Notification';
import { withAuth, RouteContext } from '@/lib/auth/withAuth';
import mongoose from 'mongoose';

async function getParamId(context: RouteContext): Promise<string> {
  const resolved = context.params ? await context.params : {};
  const idVal = resolved.id;
  return Array.isArray(idVal) ? idVal[0] : idVal || '';
}

/**
 * PATCH /api/notifications/[id]/read
 * Protected endpoint: Marks a single notification as read if owned by authenticated user.
 */
export const PATCH = withAuth([], async (req, context, session) => {
  try {
    const notificationId = await getParamId(context);

    if (!notificationId || !mongoose.Types.ObjectId.isValid(notificationId)) {
      return NextResponse.json({ error: 'Bad Request', message: 'Invalid Notification ID' }, { status: 400 });
    }

    await connectToDatabase();

    const notification = await Notification.findOne({
      _id: notificationId,
      recipient_id: session.user.id,
    });

    if (!notification) {
      return NextResponse.json({ error: 'Not Found', message: 'Notification not found or access denied' }, { status: 404 });
    }

    notification.is_read = true;
    notification.readAt = new Date();
    await notification.save();

    return NextResponse.json({
      success: true,
      message: 'Notification marked as read',
      notification: {
        id: notification._id.toString(),
        isRead: notification.is_read,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: 'Internal Server Error', message }, { status: 500 });
  }
});
