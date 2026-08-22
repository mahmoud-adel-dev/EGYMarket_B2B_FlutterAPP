import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IPlatformSettings extends Document {
  key: 'default';
  order_fee_piasters: number;
  trial_days: number;
  subscription_grace_days: number;
  payment_deadline_hours: number;
  platform_payment_accounts: Array<{
    method: 'instapay' | 'mobile_wallet' | 'bank_transfer';
    label: string;
    account_holder: string;
    account_reference: string;
    instructions?: string;
    is_active: boolean;
  }>;
  support_phone?: string;
  support_email?: string;
}

const PlatformSettingsSchema = new Schema<IPlatformSettings>(
  {
    key: { type: String, enum: ['default'], default: 'default', unique: true },
    order_fee_piasters: { type: Number, default: 5000, min: 0 },
    trial_days: { type: Number, default: 14, min: 0, max: 90 },
    subscription_grace_days: { type: Number, default: 3, min: 0, max: 30 },
    payment_deadline_hours: { type: Number, default: 48, min: 1, max: 720 },
    platform_payment_accounts: {
      type: [
        new Schema(
          {
            method: { type: String, enum: ['instapay', 'mobile_wallet', 'bank_transfer'], required: true },
            label: { type: String, required: true, trim: true },
            account_holder: { type: String, required: true, trim: true },
            account_reference: { type: String, required: true, trim: true },
            instructions: { type: String, trim: true },
            is_active: { type: Boolean, default: true },
          },
          { _id: true }
        ),
      ],
      default: [],
    },
    support_phone: { type: String, trim: true },
    support_email: { type: String, trim: true, lowercase: true },
  },
  { timestamps: true }
);

const PlatformSettings: Model<IPlatformSettings> =
  mongoose.models.PlatformSettings ||
  mongoose.model<IPlatformSettings>('PlatformSettings', PlatformSettingsSchema);

export async function getPlatformSettings() {
  return PlatformSettings.findOneAndUpdate(
    { key: 'default' },
    { $setOnInsert: { key: 'default', order_fee_piasters: 5000, trial_days: 14, payment_deadline_hours: 48 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

export default PlatformSettings;
