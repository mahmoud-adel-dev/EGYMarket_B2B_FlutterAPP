import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type TrackingEventType =
  | 'picked_up'
  | 'checkpoint'
  | 'out_for_delivery'
  | 'delivery_attempt'
  | 'delivered'
  | 'exception';

export interface IOrderTrackingEvent extends Document {
  order_id: Types.ObjectId;
  event_type: TrackingEventType;
  location: string;
  note?: string;
  created_by_user_id: Types.ObjectId;
  created_by_organization_id: Types.ObjectId;
  occurred_at: Date;
  client_event_id?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderTrackingEventSchema = new Schema<IOrderTrackingEvent>(
  {
    order_id: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    event_type: {
      type: String,
      enum: ['picked_up', 'checkpoint', 'out_for_delivery', 'delivery_attempt', 'delivered', 'exception'],
      required: true,
      index: true,
    },
    location: { type: String, required: true, trim: true, minlength: 2, maxlength: 160 },
    note: { type: String, trim: true, maxlength: 1000 },
    created_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    created_by_organization_id: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    occurred_at: { type: Date, required: true, default: Date.now, index: true },
    client_event_id: { type: String, trim: true, minlength: 8, maxlength: 100 },
  },
  { timestamps: true }
);

OrderTrackingEventSchema.index({ order_id: 1, occurred_at: 1, _id: 1 });
OrderTrackingEventSchema.index(
  { order_id: 1, client_event_id: 1 },
  { unique: true, partialFilterExpression: { client_event_id: { $type: 'string' } } }
);

const OrderTrackingEvent: Model<IOrderTrackingEvent> =
  mongoose.models.OrderTrackingEvent ||
  mongoose.model<IOrderTrackingEvent>('OrderTrackingEvent', OrderTrackingEventSchema);

export default OrderTrackingEvent;
