import { createHash, randomUUID } from 'crypto';

export const NOTIFICATION_TYPES = [
  'order_created',
  'order_accepted',
  'order_picked_up',
  'order_delivered',
  'order_confirmed',
  'order_rejected',
  'payment_proof_submitted',
  'payment_confirmed',
  'payment_rejected',
  'subscription_updated',
  'verification_updated',
  'comment_received',
  'post_liked',
  'rating_received',
  'follow_received',
  'inquiry_received',
  'message_received',
  'system',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TARGET_KINDS = [
  'order',
  'post',
  'conversation',
  'product',
  'organization',
  'subscription',
  'verification',
  'notifications',
] as const;

export type NotificationTargetKind = (typeof NOTIFICATION_TARGET_KINDS)[number];

export interface NotificationTarget {
  kind: NotificationTargetKind;
  id?: string;
}

export interface NotificationTargetResolutionInput {
  type: NotificationType | string;
  orderId?: unknown;
  postId?: unknown;
  metadata?: Record<string, unknown> | null;
  target?: NotificationTarget | Record<string, unknown> | null;
}

export interface NotificationEventKeyInput extends NotificationTargetResolutionInput {
  organizationId: unknown;
  eventKey?: string;
  title?: string;
  body?: string;
}

const targetKinds = new Set<string>(NOTIFICATION_TARGET_KINDS);
const targetKindsRequiringId = new Set<NotificationTargetKind>([
  'order',
  'post',
  'conversation',
  'product',
  'organization',
]);

function nonEmptyString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const normalized = value.toString().trim();
  return normalized.length > 0 ? normalized : undefined;
}

function metadataString(
  metadata: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = nonEmptyString(metadata[key]);
    if (value) return value;
  }
  return undefined;
}

export function normalizeNotificationTarget(value: unknown): NotificationTarget | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const kind = nonEmptyString(raw.kind);
  if (!kind || !targetKinds.has(kind)) return undefined;

  const typedKind = kind as NotificationTargetKind;
  const id = nonEmptyString(raw.id);
  if (targetKindsRequiringId.has(typedKind) && !id) return undefined;
  return id ? { kind: typedKind, id } : { kind: typedKind };
}

/**
 * Resolve a safe, typed in-app destination from legacy notification fields.
 * Arbitrary paths/URLs are deliberately not accepted: clients must switch on
 * the allow-listed target kind and the destination API performs authorization.
 */
export function resolveNotificationTarget(
  input: NotificationTargetResolutionInput
): NotificationTarget {
  const explicit = normalizeNotificationTarget(input.target);
  if (explicit) return explicit;

  const metadata = input.metadata && typeof input.metadata === 'object'
    ? input.metadata
    : {};
  const type = input.type;
  const orderId = nonEmptyString(input.orderId);
  const postId = nonEmptyString(input.postId);
  const conversationId = metadataString(metadata, 'conversationId', 'conversation_id');
  const productId = metadataString(metadata, 'productId', 'product_id');

  // Message notifications must open their conversation even when linked to an order.
  if ((type === 'message_received' || type === 'inquiry_received') && conversationId) {
    return { kind: 'conversation', id: conversationId };
  }
  if ((type === 'comment_received' || type === 'post_liked') && postId) {
    return { kind: 'post', id: postId };
  }
  if (type === 'rating_received') {
    const targetType = metadataString(metadata, 'targetType', 'target_type');
    const targetId = metadataString(metadata, 'targetId', 'target_id');
    if (targetType === 'product' && targetId) return { kind: 'product', id: targetId };
    if ((targetType === 'wholesaler' || targetType === 'organization') && targetId) {
      return { kind: 'organization', id: targetId };
    }
  }
  if (type === 'follow_received') {
    const actorOrganizationId = metadataString(
      metadata,
      'actorOrganizationId',
      'actor_organization_id'
    );
    if (actorOrganizationId) return { kind: 'organization', id: actorOrganizationId };
  }
  if (type === 'subscription_updated') return { kind: 'subscription' };
  if (type === 'verification_updated') return { kind: 'verification' };
  if (orderId) return { kind: 'order', id: orderId };
  if (postId) return { kind: 'post', id: postId };
  if (conversationId) return { kind: 'conversation', id: conversationId };
  if (productId) return { kind: 'product', id: productId };
  return { kind: 'notifications' };
}

function stableIdentity(input: NotificationEventKeyInput): string | undefined {
  const metadata = input.metadata && typeof input.metadata === 'object'
    ? input.metadata
    : {};
  const explicitIdentity = metadataString(
    metadata,
    'eventId',
    'event_id',
    'messageId',
    'message_id',
    'interactionId',
    'interaction_id',
    'commentId',
    'comment_id',
    'trackingEventId',
    'tracking_event_id',
    'paymentId',
    'payment_id',
    'obligationId',
    'obligation_id',
    'ratingId',
    'rating_id',
    'followId',
    'follow_id'
  );
  if (explicitIdentity) return `event:${explicitIdentity}`;

  const target = resolveNotificationTarget(input);
  const actor = metadataString(
    metadata,
    'actorUserId',
    'actor_user_id',
    'actorOrganizationId',
    'actor_organization_id'
  );

  // These domain events have a naturally stable identity and should not fan out
  // twice when a request is retried.
  if (input.type === 'post_liked' && target.id && actor) {
    return `post-like:${target.id}:${actor}`;
  }
  if (input.type === 'follow_received' && actor) {
    return `follow:${actor}`;
  }
  if (input.type === 'rating_received' && target.id && actor) {
    return `rating:${target.kind}:${target.id}:${actor}`;
  }
  if (input.type === 'inquiry_received' && target.kind === 'conversation' && target.id) {
    return `inquiry:${target.id}`;
  }
  if (input.orderId && input.type.startsWith('order_')) {
    return `order:${nonEmptyString(input.orderId)}:${input.type}`;
  }
  return undefined;
}

/**
 * Produce a compact key used both to deduplicate the outbox event and every
 * per-user delivery. Callers should pass eventKey (or a domain event id in
 * metadata) whenever repeated, identical events are legitimate.
 */
export function deriveNotificationEventKey(input: NotificationEventKeyInput): string {
  const organizationId = nonEmptyString(input.organizationId) ?? 'unknown';
  const identity = nonEmptyString(input.eventKey) ?? stableIdentity(input) ?? randomUUID();
  const digest = createHash('sha256')
    .update(`${organizationId}\u0000${input.type}\u0000${identity}`)
    .digest('hex');
  return `notification:${digest}`;
}

export function notificationRetryDelayMs(attempt: number): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const baseMs = 30_000;
  const maxMs = 6 * 60 * 60 * 1000;
  return Math.min(maxMs, baseMs * 2 ** Math.min(safeAttempt - 1, 10));
}
