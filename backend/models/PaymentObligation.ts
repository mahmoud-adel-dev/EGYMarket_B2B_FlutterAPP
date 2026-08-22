import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type ObligationKind = 'platform_fee' | 'goods' | 'shipping';
export type ObligationStatus =
  | 'pending'
  | 'proof_submitted'
  | 'confirmed'
  | 'rejected'
  | 'disputed'
  | 'refund_pending'
  | 'refunded';

export interface IPaymentObligation extends Document {
  _id: Types.ObjectId;
  order_id: Types.ObjectId;
  kind: ObligationKind;
  payer_organization_id: Types.ObjectId;
  beneficiary_type: 'platform' | 'organization';
  beneficiary_organization_id?: Types.ObjectId;
  amount_piasters: number;
  currency: 'EGP';
  status: ObligationStatus;
  payment_method?: 'instapay' | 'mobile_wallet' | 'bank_transfer' | 'cash';
  payment_account_snapshot?: Record<string, unknown>;
  sender_reference?: string;
  proof_url?: string;
  payer_note?: string;
  payer_confirmed_at?: Date;
  beneficiary_confirmed_at?: Date;
  beneficiary_confirmed_by?: Types.ObjectId;
  rejection_reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentObligationSchema = new Schema<IPaymentObligation>(
  {
    order_id: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    kind: { type: String, enum: ['platform_fee', 'goods', 'shipping'], required: true },
    payer_organization_id: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    beneficiary_type: { type: String, enum: ['platform', 'organization'], required: true },
    beneficiary_organization_id: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    amount_piasters: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['EGP'], default: 'EGP' },
    status: {
      type: String,
      enum: ['pending', 'proof_submitted', 'confirmed', 'rejected', 'disputed', 'refund_pending', 'refunded'],
      default: 'pending',
      index: true,
    },
    payment_method: { type: String, enum: ['instapay', 'mobile_wallet', 'bank_transfer', 'cash'] },
    payment_account_snapshot: Schema.Types.Mixed,
    sender_reference: { type: String, trim: true },
    proof_url: { type: String, trim: true },
    payer_note: { type: String, trim: true, maxlength: 1000 },
    payer_confirmed_at: Date,
    beneficiary_confirmed_at: Date,
    beneficiary_confirmed_by: { type: Schema.Types.ObjectId, ref: 'User' },
    rejection_reason: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);
PaymentObligationSchema.set('optimisticConcurrency', true);

PaymentObligationSchema.index({ order_id: 1, kind: 1 }, { unique: true });
PaymentObligationSchema.index({ payer_organization_id: 1, status: 1, order_id: 1 });
PaymentObligationSchema.index({ beneficiary_organization_id: 1, status: 1, kind: 1, order_id: 1 });
PaymentObligationSchema.index({ beneficiary_type: 1, status: 1, kind: 1, order_id: 1 });

const PaymentObligation: Model<IPaymentObligation> =
  mongoose.models.PaymentObligation ||
  mongoose.model<IPaymentObligation>('PaymentObligation', PaymentObligationSchema);
export default PaymentObligation;
