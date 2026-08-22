import Notification from '@/models/Notification';

export interface MarkNotificationReadResult {
  found: boolean;
  changed: boolean;
  notification?: {
    id: string;
    isRead: true;
    readAt: string | null;
  };
  unreadCount: number;
}

function isoDate(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value.toString());
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Atomically changes unread -> read. Replays preserve the original readAt. */
export async function markNotificationAsRead(
  recipientId: string,
  notificationId: string,
  now = new Date()
): Promise<MarkNotificationReadResult> {
  const updated = await Notification.findOneAndUpdate(
    {
      _id: notificationId,
      recipient_id: recipientId,
      is_read: false,
    },
    { $set: { is_read: true, readAt: now } },
    { new: true }
  )
    .select('_id is_read readAt')
    .lean();

  let notification = updated;
  let changed = Boolean(updated);
  if (!notification) {
    notification = await Notification.findOne({
      _id: notificationId,
      recipient_id: recipientId,
    })
      .select('_id is_read readAt')
      .lean();
    changed = false;
  }

  if (!notification) {
    return { found: false, changed: false, unreadCount: 0 };
  }

  const unreadCount = await Notification.countDocuments({
    recipient_id: recipientId,
    is_read: false,
  });
  return {
    found: true,
    changed,
    unreadCount,
    notification: {
      id: notification._id.toString(),
      isRead: true,
      readAt: isoDate(notification.readAt),
    },
  };
}

/** Idempotent bulk transition scoped to the authenticated recipient. */
export async function markAllNotificationsAsRead(
  recipientId: string,
  now = new Date()
) {
  const result = await Notification.updateMany(
    { recipient_id: recipientId, is_read: false },
    { $set: { is_read: true, readAt: now } }
  );
  // Count after the update so a concurrently-created notification is not hidden
  // behind an incorrect client-side assumption of zero.
  const unreadCount = await Notification.countDocuments({
    recipient_id: recipientId,
    is_read: false,
  });
  return {
    changedCount: result.modifiedCount,
    unreadCount,
  };
}
