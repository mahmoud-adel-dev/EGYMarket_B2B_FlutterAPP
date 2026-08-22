import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { OrganizationType } from '@/models/Organization';

export interface ISubscriptionPlan extends Document {
  _id: Types.ObjectId;
  code: string;
  name_ar: string;
  name_en: string;
  description_ar?: string;
  price_piasters: number;
  billing_interval: 'monthly' | 'yearly';
  organization_types: OrganizationType[];
  features: string[];
  is_active: boolean;
  sort_order: number;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionPlanSchema = new Schema<ISubscriptionPlan>(
  {
    code: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name_ar: { type: String, required: true, trim: true },
    name_en: { type: String, required: true, trim: true },
    description_ar: { type: String, trim: true },
    price_piasters: { type: Number, required: true, min: 0 },
    billing_interval: { type: String, enum: ['monthly', 'yearly'], required: true },
    organization_types: {
      type: [String],
      enum: ['wholesaler', 'buyer', 'shipper'],
      required: true,
    },
    features: { type: [String], default: [] },
    is_active: { type: Boolean, default: true, index: true },
    sort_order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const SubscriptionPlan: Model<ISubscriptionPlan> =
  mongoose.models.SubscriptionPlan ||
  mongoose.model<ISubscriptionPlan>('SubscriptionPlan', SubscriptionPlanSchema);

export default SubscriptionPlan;
