import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { LocalPaymentMethod } from '@/models/Organization';

export interface ISubscriptionInvoice extends Document {
  _id: Types.ObjectId;
  invoice_number: string;
  organization_id: Types.ObjectId;
  subscription_id: Types.ObjectId;
  plan_id: Types.ObjectId;
  amount_piasters: number;
  currency: 'EGP';
  status: 'pending' | 'proof_submitted' | 'paid' | 'rejected' | 'void';
  payment_method?: LocalPaymentMethod;
  sender_reference?: string;
  proof_url?: string;
  payer_confirmed_at?: Date;
  reviewed_at?: Date;
  reviewed_by?: Types.ObjectId;
  rejection_reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionInvoiceSchema = new Schema<ISubscriptionInvoice>(
  {
    invoice_number: { type: String, required: true, unique: true, index: true },
    organization_id: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    subscription_id: { type: Schema.Types.ObjectId, ref: 'Subscription', required: true, index: true },
    plan_id: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
    amount_piasters: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['EGP'], default: 'EGP' },
    status: {
      type: String,
      enum: ['pending', 'proof_submitted', 'paid', 'rejected', 'void'],
      default: 'pending',
      index: true,
    },
    payment_method: { type: String, enum: ['instapay', 'mobile_wallet', 'bank_transfer', 'cash'] },
    sender_reference: { type: String, trim: true },
    proof_url: { type: String, trim: true },
    payer_confirmed_at: Date,
    reviewed_at: Date,
    reviewed_by: { type: Schema.Types.ObjectId, ref: 'User' },
    rejection_reason: { type: String, trim: true },
  },
  { timestamps: true }
);

const SubscriptionInvoice: Model<ISubscriptionInvoice> =
  mongoose.models.SubscriptionInvoice ||
  mongoose.model<ISubscriptionInvoice>('SubscriptionInvoice', SubscriptionInvoiceSchema);

export default SubscriptionInvoice;
