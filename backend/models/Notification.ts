import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import {
  NOTIFICATION_TARGET_KINDS,
  NOTIFICATION_TYPES,
  NotificationTarget,
  NotificationType,
} from '@/lib/notifications/notification_contract';

export type { NotificationTarget, NotificationType };

export interface INotification extends Document {
  _id: Types.ObjectId;
  recipient_id: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  order_id?: Types.ObjectId;
  post_id?: Types.ObjectId;
  is_read: boolean;
  createdAt: Date;
  readAt?: Date;
  metadata?: Record<string, unknown>;
  target?: NotificationTarget;
  source_event_key?: string;
  delivery_key?: string;
}

const NotificationTargetSchema = new Schema<NotificationTarget>(
  {
    kind: {
      type: String,
      enum: NOTIFICATION_TARGET_KINDS,
      required: true,
    },
    id: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const NotificationSchema = new Schema<INotification>(
  {
    recipient_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recipient User ID is required'],
      index: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: [true, 'Notification type is required'],
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
    },
    body: {
      type: String,
      required: [true, 'Notification body text is required'],
      trim: true,
    },
    order_id: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
    },
    post_id: {
      type: Schema.Types.ObjectId,
      ref: 'Post',
    },
    is_read: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    target: {
      type: NotificationTargetSchema,
    },
    source_event_key: {
      type: String,
      trim: true,
      index: true,
    },
    delivery_key: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

NotificationSchema.index({ recipient_id: 1, is_read: 1, createdAt: -1 });
NotificationSchema.index({ recipient_id: 1, createdAt: -1 });
NotificationSchema.index(
  { delivery_key: 1 },
  { unique: true, sparse: true, name: 'notification_delivery_key_unique' }
);

const Notification: Model<INotification> =
  mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema);

export default Notification;
