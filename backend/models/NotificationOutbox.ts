import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import {
  NOTIFICATION_TARGET_KINDS,
  NOTIFICATION_TYPES,
  NotificationTarget,
  NotificationType,
} from '@/lib/notifications/notification_contract';

export type NotificationOutboxStatus = 'pending' | 'processing' | 'delivered' | 'dead_letter';

export interface INotificationOutbox extends Document {
  _id: Types.ObjectId;
  event_key: string;
  organization_id: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  order_id?: Types.ObjectId;
  post_id?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  target: NotificationTarget;
  status: NotificationOutboxStatus;
  attempts: number;
  next_attempt_at: Date;
  locked_at?: Date;
  delivered_at?: Date;
  delivery_count: number;
  last_error?: string;
  purge_at?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TargetSchema = new Schema<NotificationTarget>(
  {
    kind: { type: String, enum: NOTIFICATION_TARGET_KINDS, required: true },
    id: { type: String, trim: true },
  },
  { _id: false }
);

const NotificationOutboxSchema = new Schema<INotificationOutbox>(
  {
    event_key: { type: String, required: true, trim: true },
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    order_id: { type: Schema.Types.ObjectId, ref: 'Order' },
    post_id: { type: Schema.Types.ObjectId, ref: 'Post' },
    metadata: { type: Schema.Types.Mixed },
    target: { type: TargetSchema, required: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'delivered', 'dead_letter'],
      default: 'pending',
      required: true,
    },
    attempts: { type: Number, default: 0, min: 0 },
    next_attempt_at: { type: Date, default: Date.now, required: true },
    locked_at: Date,
    delivered_at: Date,
    delivery_count: { type: Number, default: 0, min: 0 },
    last_error: { type: String },
    purge_at: Date,
  },
  { timestamps: true }
);

NotificationOutboxSchema.index(
  { event_key: 1 },
  { unique: true, name: 'notification_outbox_event_key_unique' }
);
NotificationOutboxSchema.index({ status: 1, next_attempt_at: 1, locked_at: 1, createdAt: 1 });
NotificationOutboxSchema.index({ purge_at: 1 }, { expireAfterSeconds: 0 });

const NotificationOutbox: Model<INotificationOutbox> =
  mongoose.models.NotificationOutbox ||
  mongoose.model<INotificationOutbox>('NotificationOutbox', NotificationOutboxSchema);

export default NotificationOutbox;
