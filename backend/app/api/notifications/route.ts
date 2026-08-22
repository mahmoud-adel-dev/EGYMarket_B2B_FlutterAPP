import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db/mongoose';
import Notification from '@/models/Notification';
import { withAuth } from '@/lib/auth/withAuth';
import { parsePagination } from '@/lib/api/pagination';
import { serializeNotification } from '@/lib/notifications/notification_serializer';
import { markAllNotificationsAsRead } from '@/lib/notifications/notification_read_service';

/**
 * GET /api/notifications
 * Protected endpoint: Returns paginated notifications and unread count for the authenticated user.
 */
export const GET = withAuth([], async (req: NextRequest, context, session) => {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = parsePagination(searchParams);
    const page = parsed.page;
    const limit = Math.min(parsed.limit, 50);
    const skip = (page - 1) * limit;

    await connectToDatabase();

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find({ recipient_id: session.user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ recipient_id: session.user.id }),
      Notification.countDocuments({ recipient_id: session.user.id, is_read: false }),
    ]);

    const pages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        pages,
      },
      notifications: notifications.map(serializeNotification),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected server error occurred' },
      { status: 500 }
    );
  }
});

/**
 * PATCH /api/notifications/read-all
 * Protected endpoint: Marks all notifications as read for the authenticated user.
 */
export const PATCH = withAuth([], async (req: NextRequest, context, session) => {
  try {
    await connectToDatabase();

    const result = await markAllNotificationsAsRead(session.user.id);

    return NextResponse.json({
      success: true,
      message: 'All notifications marked as read',
      changedCount: result.changedCount,
      unreadCount: result.unreadCount,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected server error occurred' },
      { status: 500 }
    );
  }
});
