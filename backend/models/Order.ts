import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type FulfillmentMethod = 'buyer_pickup' | 'third_party_shipping';
export type OrderStatus =
  | 'requested'
  | 'rejected'
  | 'awaiting_payments'
  | 'preparing'
  | 'ready_for_pickup'
  | 'in_transit'
  | 'delivered'
  | 'completed'
  | 'canceled'
  | 'disputed';

export interface IOrderItem {
  product_id: Types.ObjectId;
  sku?: string;
  title: string;
  unit: string;
  quantity: number;
  unit_price_piasters: number;
  subtotal_piasters: number;
}

export interface IOrderStatusHistory {
  status: OrderStatus;
  previous_status?: OrderStatus;
  changed_by: Types.ObjectId;
  changed_by_role: string;
  changed_by_organization_id?: Types.ObjectId;
  timestamp: Date;
  note?: string;
}

export interface IOrder extends Document {
  _id: Types.ObjectId;
  order_number: string;
  buyer_organization_id: Types.ObjectId;
  seller_organization_id: Types.ObjectId;
  shipper_organization_id?: Types.ObjectId;
  created_by: Types.ObjectId;
  fulfillment_method: FulfillmentMethod;
  shipping_rate_id?: Types.ObjectId;
  shipping_address?: { governorate: string; address: string; contact_name: string; phone: string };
  items: IOrderItem[];
  goods_subtotal_piasters: number;
  shipping_cost_piasters: number;
  platform_fee_piasters: number;
  total_payable_piasters: number;
  currency: 'EGP';
  status: OrderStatus;
  status_history: IOrderStatusHistory[];
  inventory_reserved: boolean;
  inventory_committed: boolean;
  cancellation_reason?: string;
  payment_due_at?: Date;
  /** Immutable business milestone: once set, later disputes/refunds never re-lock the buyer's order room. */
  buyer_chat_unlocked_at?: Date;
  /** Client-generated idempotency key: the same logical submit (retry/double-tap)
   *  reuses one key so it cannot create duplicate orders. Nullable. */
  client_order_id?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    sku: { type: String, trim: true },
    title: { type: String, required: true, trim: true },
    unit: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unit_price_piasters: { type: Number, required: true, min: 0 },
    subtotal_piasters: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const StatusHistorySchema = new Schema<IOrderStatusHistory>(
  {
    status: { type: String, required: true },
    previous_status: String,
    changed_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    changed_by_role: { type: String, required: true },
    changed_by_organization_id: { type: Schema.Types.ObjectId, ref: 'Organization' },
    timestamp: { type: Date, default: Date.now },
    note: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false }
);

const OrderSchema = new Schema<IOrder>(
  {
    order_number: { type: String, required: true, unique: true, index: true },
    buyer_organization_id: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    seller_organization_id: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    shipper_organization_id: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fulfillment_method: {
      type: String,
      enum: ['buyer_pickup', 'third_party_shipping'],
      required: true,
    },
    shipping_rate_id: { type: Schema.Types.ObjectId, ref: 'ShippingRate' },
    shipping_address: {
      governorate: { type: String, trim: true },
      address: { type: String, trim: true },
      contact_name: { type: String, trim: true },
      phone: { type: String, trim: true },
    },
    items: {
      type: [OrderItemSchema],
      required: true,
      validate: { validator: (items: IOrderItem[]) => items.length > 0, message: 'Order items are required' },
    },
    goods_subtotal_piasters: { type: Number, required: true, min: 0 },
    shipping_cost_piasters: { type: Number, required: true, min: 0, default: 0 },
    platform_fee_piasters: { type: Number, required: true, min: 0, default: 5000 },
    total_payable_piasters: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['EGP'], default: 'EGP' },
    status: {
      type: String,
      enum: [
        'requested',
        'rejected',
        'awaiting_payments',
        'preparing',
        'ready_for_pickup',
        'in_transit',
        'delivered',
        'completed',
        'canceled',
        'disputed',
      ],
      default: 'requested',
      index: true,
    },
    status_history: { type: [StatusHistorySchema], default: [] },
    inventory_reserved: { type: Boolean, default: false },
    inventory_committed: { type: Boolean, default: false },
    cancellation_reason: { type: String, trim: true, maxlength: 1000 },
    payment_due_at: { type: Date, index: true },
    buyer_chat_unlocked_at: Date,
    client_order_id: { type: String, trim: true, maxlength: 100 },
  },
  { timestamps: true }
);
OrderSchema.set('optimisticConcurrency', true);

// Idempotency: at most one order per creator per client idempotency key.
// The partial filter means an absent key is not constrained (attributes are
// optional), while a supplied key dedupes retries/double-taps.
OrderSchema.index(
  { created_by: 1, client_order_id: 1 },
  { unique: true, partialFilterExpression: { client_order_id: { $type: 'string' } } }
);

OrderSchema.index({ buyer_organization_id: 1, createdAt: -1 });
OrderSchema.index({ buyer_organization_id: 1, status: 1, fulfillment_method: 1 });
OrderSchema.index({ seller_organization_id: 1, status: 1, createdAt: -1 });
OrderSchema.index({ shipper_organization_id: 1, status: 1, createdAt: -1 });

const Order: Model<IOrder> = mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema);
export default Order;
