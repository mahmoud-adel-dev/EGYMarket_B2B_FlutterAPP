import {
  NotificationTarget,
  resolveNotificationTarget,
} from '@/lib/notifications/notification_contract';

export interface NotificationRecordLike {
  _id?: unknown;
  id?: unknown;
  type?: unknown;
  title?: unknown;
  body?: unknown;
  order_id?: unknown;
  orderId?: unknown;
  post_id?: unknown;
  postId?: unknown;
  metadata?: unknown;
  target?: unknown;
  is_read?: unknown;
  isRead?: unknown;
  createdAt?: unknown;
  readAt?: unknown;
}

function stringValue(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  const normalized = value.toString();
  return normalized || fallback;
}

function optionalString(value: unknown): string | undefined {
  const normalized = stringValue(value).trim();
  return normalized || undefined;
}

function isoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(stringValue(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function metadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

/** Canonical API DTO used by every notification list/read endpoint. */
export function serializeNotification(record: NotificationRecordLike) {
  const orderId = optionalString(record.order_id ?? record.orderId);
  const postId = optionalString(record.post_id ?? record.postId);
  const metadata = metadataRecord(record.metadata);
  const target: NotificationTarget = resolveNotificationTarget({
    type: stringValue(record.type, 'system'),
    orderId,
    postId,
    metadata,
    target:
      record.target && typeof record.target === 'object'
        ? (record.target as Record<string, unknown>)
        : undefined,
  });

  return {
    id: stringValue(record._id ?? record.id),
    type: stringValue(record.type, 'system'),
    title: stringValue(record.title, 'Notification'),
    body: stringValue(record.body),
    orderId,
    postId,
    metadata,
    target,
    isRead: record.is_read === true || record.isRead === true,
    createdAt: isoDate(record.createdAt),
    readAt: isoDate(record.readAt),
  };
}
