import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type SubscriptionStatus =
  | 'trialing'
  | 'pending_payment'
  | 'under_review'
  | 'active'
  | 'grace_period'
  | 'expired'
  | 'canceled'
  | 'rejected';

export interface ISubscription extends Document {
  _id: Types.ObjectId;
  organization_id: Types.ObjectId;
  plan_id?: Types.ObjectId;
  status: SubscriptionStatus;
  starts_at: Date;
  current_period_ends_at: Date;
  grace_ends_at?: Date;
  cancel_at_period_end: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    organization_id: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    plan_id: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan', index: true },
    status: {
      type: String,
      enum: [
        'trialing',
        'pending_payment',
        'under_review',
        'active',
        'grace_period',
        'expired',
        'canceled',
        'rejected',
      ],
      default: 'trialing',
      index: true,
    },
    starts_at: { type: Date, required: true, default: Date.now },
    current_period_ends_at: { type: Date, required: true },
    grace_ends_at: Date,
    cancel_at_period_end: { type: Boolean, default: false },
  },
  { timestamps: true }
);

SubscriptionSchema.index({ organization_id: 1, createdAt: -1 });

const Subscription: Model<ISubscription> =
  mongoose.models.Subscription || mongoose.model<ISubscription>('Subscription', SubscriptionSchema);

export default Subscription;
