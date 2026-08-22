import mongoose, { FilterQuery } from 'mongoose';
import connectToDatabase from '@/lib/db/mongoose';
import Notification from '@/models/Notification';
import NotificationOutbox, { INotificationOutbox } from '@/models/NotificationOutbox';
import OrganizationMember from '@/models/OrganizationMember';
import {
  deriveNotificationEventKey,
  NotificationTarget,
  NotificationType,
  notificationRetryDelayMs,
  resolveNotificationTarget,
} from '@/lib/notifications/notification_contract';

export interface CreateNotificationInput {
  recipientId: string | mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  orderId?: string | mongoose.Types.ObjectId;
  postId?: string | mongoose.Types.ObjectId;
  metadata?: Record<string, unknown>;
  target?: NotificationTarget;
  /** Stable domain-event identity. Prefer an entity/event id, never user content. */
  eventKey?: string;
}

export interface NotificationEnqueueResult {
  accepted: boolean;
  eventKey: string;
  deliveredNow: boolean;
  error?: 'invalid_organization_id' | 'outbox_enqueue_failed';
}

export interface NotificationOutboxProcessResult {
  claimed: number;
  delivered: number;
  failed: number;
  deadLettered: number;
  notificationsCreated: number;
}

const MAX_DELIVERY_ATTEMPTS = 12;
const PROCESSING_LEASE_MS = 5 * 60 * 1000;
const DELIVERED_OUTBOX_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function asObjectId(value: unknown): mongoose.Types.ObjectId | undefined {
  const normalized = value?.toString();
  if (!normalized || !mongoose.Types.ObjectId.isValid(normalized)) return undefined;
  return new mongoose.Types.ObjectId(normalized);
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, ' ').slice(0, 500);
}

function logNotificationFailure(
  event: string,
  fields: Record<string, unknown>,
  error?: unknown
) {
  console.error(
    JSON.stringify({
      level: 'error',
      msg: event,
      ...fields,
      ...(error ? { error: safeErrorMessage(error) } : {}),
    })
  );
}

function deliveryKey(eventKey: string, recipientId: unknown): string {
  return `${eventKey}:${recipientId?.toString() ?? 'unknown'}`;
}

/**
 * Persist an organization event before attempting fan-out. The method never
 * throws into a domain route: a failed enqueue is reported loudly and returned
 * to the caller, while a successful enqueue remains durable for cron retries.
 */
export async function createOrganizationNotification(
  organizationId: string | mongoose.Types.ObjectId,
  input: Omit<CreateNotificationInput, 'recipientId'>
): Promise<NotificationEnqueueResult> {
  const eventKey = deriveNotificationEventKey({
    ...input,
    organizationId,
  });
  const organizationObjectId = asObjectId(organizationId);
  if (!organizationObjectId) {
    logNotificationFailure('notification_outbox_invalid_organization', {
      event_key: eventKey,
      notification_type: input.type,
    });
    return {
      accepted: false,
      eventKey,
      deliveredNow: false,
      error: 'invalid_organization_id',
    };
  }

  const target = resolveNotificationTarget(input);
  try {
    await connectToDatabase();
    await NotificationOutbox.findOneAndUpdate(
      { event_key: eventKey },
      {
        $setOnInsert: {
          event_key: eventKey,
          organization_id: organizationObjectId,
          type: input.type,
          title: input.title,
          body: input.body,
          order_id: asObjectId(input.orderId),
          post_id: asObjectId(input.postId),
          metadata: input.metadata,
          target,
          status: 'pending',
          attempts: 0,
          next_attempt_at: new Date(),
          delivery_count: 0,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    // No transaction can make an already-committed domain mutation and a later
    // enqueue atomic. Do not lie with a 500 after that mutation; emit a loud,
    // structured operational error so monitoring/manual replay can act on it.
    logNotificationFailure(
      'notification_outbox_enqueue_failed',
      {
        event_key: eventKey,
        organization_id: organizationObjectId.toString(),
        notification_type: input.type,
      },
      error
    );
    return {
      accepted: false,
      eventKey,
      deliveredNow: false,
      error: 'outbox_enqueue_failed',
    };
  }

  let deliveredNow = false;
  try {
    const result = await processNotificationOutbox({ eventKey, limit: 1 });
    deliveredNow = result.delivered > 0;
  } catch (error) {
    // The event is already durable. Cron maintenance will retry it.
    logNotificationFailure(
      'notification_outbox_immediate_dispatch_failed',
      { event_key: eventKey, notification_type: input.type },
      error
    );
  }

  return { accepted: true, eventKey, deliveredNow };
}

/** Direct per-user delivery, retained for callers that do not target an organization. */
export async function createNotification(input: CreateNotificationInput) {
  const recipientId = asObjectId(input.recipientId);
  const eventKey = deriveNotificationEventKey({
    ...input,
    organizationId: `user:${input.recipientId.toString()}`,
  });
  if (!recipientId) {
    logNotificationFailure('notification_invalid_recipient', {
      event_key: eventKey,
      notification_type: input.type,
    });
    return null;
  }

  try {
    await connectToDatabase();
    return await Notification.findOneAndUpdate(
      { delivery_key: deliveryKey(eventKey, recipientId) },
      {
        $setOnInsert: {
          recipient_id: recipientId,
          type: input.type,
          title: input.title,
          body: input.body,
          order_id: asObjectId(input.orderId),
          post_id: asObjectId(input.postId),
          metadata: input.metadata,
          target: resolveNotificationTarget(input),
          source_event_key: eventKey,
          delivery_key: deliveryKey(eventKey, recipientId),
          is_read: false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    logNotificationFailure(
      'notification_direct_delivery_failed',
      {
        event_key: eventKey,
        recipient_id: recipientId.toString(),
        notification_type: input.type,
      },
      error
    );
    return null;
  }
}

async function deliverClaimedEvent(outbox: INotificationOutbox): Promise<number> {
  const members = await OrganizationMember.find({
    organization_id: outbox.organization_id,
    status: 'active',
  })
    .select('user_id')
    .lean();

  if (members.length === 0) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        msg: 'notification_outbox_no_active_recipients',
        event_key: outbox.event_key,
        organization_id: outbox.organization_id.toString(),
      })
    );
    return 0;
  }

  const operations = members.map((member) => {
    const recipientId = member.user_id;
    const key = deliveryKey(outbox.event_key, recipientId);
    return {
      updateOne: {
        filter: { delivery_key: key },
        update: {
          $setOnInsert: {
            recipient_id: recipientId,
            type: outbox.type,
            title: outbox.title,
            body: outbox.body,
            order_id: outbox.order_id,
            post_id: outbox.post_id,
            metadata: outbox.metadata,
            target: outbox.target,
            source_event_key: outbox.event_key,
            delivery_key: key,
            is_read: false,
          },
        },
        upsert: true,
      },
    };
  });
  const result = await Notification.bulkWrite(operations, { ordered: false });
  return result.upsertedCount;
}

export async function processNotificationOutbox(options: {
  limit?: number;
  eventKey?: string;
} = {}): Promise<NotificationOutboxProcessResult> {
  await connectToDatabase();
  const limit = Math.max(1, Math.min(Math.floor(options.limit ?? 50), 200));
  const stats: NotificationOutboxProcessResult = {
    claimed: 0,
    delivered: 0,
    failed: 0,
    deadLettered: 0,
    notificationsCreated: 0,
  };

  for (let index = 0; index < limit; index += 1) {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - PROCESSING_LEASE_MS);
    const query: FilterQuery<INotificationOutbox> = {
      ...(options.eventKey ? { event_key: options.eventKey } : {}),
      $or: [
        { status: 'pending', next_attempt_at: { $lte: now } },
        { status: 'processing', locked_at: { $lte: staleBefore } },
      ],
    };
    const claimed = await NotificationOutbox.findOneAndUpdate(
      query,
      {
        $set: { status: 'processing', locked_at: now },
        $inc: { attempts: 1 },
        $unset: { last_error: 1 },
      },
      { new: true, sort: { createdAt: 1 } }
    );
    if (!claimed) break;
    stats.claimed += 1;

    try {
      const created = await deliverClaimedEvent(claimed);
      const deliveredAt = new Date();
      await NotificationOutbox.updateOne(
        { _id: claimed._id, status: 'processing' },
        {
          $set: {
            status: 'delivered',
            delivered_at: deliveredAt,
            delivery_count: created,
            purge_at: new Date(deliveredAt.getTime() + DELIVERED_OUTBOX_RETENTION_MS),
          },
          $unset: { locked_at: 1, last_error: 1 },
        }
      );
      stats.delivered += 1;
      stats.notificationsCreated += created;
    } catch (error) {
      const deadLetter = claimed.attempts >= MAX_DELIVERY_ATTEMPTS;
      const nextAttemptAt = new Date(Date.now() + notificationRetryDelayMs(claimed.attempts));
      await NotificationOutbox.updateOne(
        { _id: claimed._id, status: 'processing' },
        {
          $set: {
            status: deadLetter ? 'dead_letter' : 'pending',
            next_attempt_at: nextAttemptAt,
            last_error: safeErrorMessage(error),
          },
          $unset: { locked_at: 1 },
        }
      );
      stats.failed += 1;
      if (deadLetter) stats.deadLettered += 1;
      logNotificationFailure(
        deadLetter
          ? 'notification_outbox_dead_lettered'
          : 'notification_outbox_delivery_failed',
        {
          event_key: claimed.event_key,
          organization_id: claimed.organization_id.toString(),
          attempt: claimed.attempts,
          next_attempt_at: deadLetter ? undefined : nextAttemptAt.toISOString(),
        },
        error
      );
    }
  }

  return stats;
}
