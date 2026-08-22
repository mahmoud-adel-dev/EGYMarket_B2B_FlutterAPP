import mongoose, { Schema, Document, Model } from 'mongoose';
import { UserRole } from '@/types/next-auth';

export type PaymentMethod = 'instapay' | 'mobile_wallet' | 'bank_transfer' | 'cash';

export interface ILocalPaymentDetails {
  method_name: string; // e.g. "InstaPay", "Vodafone Cash", "CIB Bank Transfer"
  account_number: string; // Mobile number or IBAN/address
  instructions?: string; // Custom instructions for the buyer
}

export interface IPaymentSettings {
  accepted_methods: PaymentMethod[];
  local_payment_details?: ILocalPaymentDetails;
  instapay_address?: string;
}

export interface IUserLocation {
  governorate: string;
  address?: string;
}

export interface IUserContactMethods {
  phone?: string;
  whatsapp?: string;
  email?: string;
}

export interface IUserSubscription {
  plan_name: string;
  status: 'active' | 'expired' | 'canceled';
  expires_at: Date;
}

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  location: IUserLocation;
  role: UserRole;
  organization_id?: mongoose.Types.ObjectId;
  isActive: boolean;
  failed_login_attempts: number;
  locked_until?: Date;
  email_verified_at?: Date;
  session_version: number;
  terms_accepted_at?: Date;
  terms_version?: string;
  deletion_requested_at?: Date;
  deletion_scheduled_for?: Date;
  avatar_url?: string;
  cover_url?: string;
  business_name?: string;
  business_description?: string;
  contact_methods?: IUserContactMethods;
  paymentSettings?: IPaymentSettings;
  subscription?: IUserSubscription;
  interested_categories?: string[]; // For Retailer feed personalization
  createdAt: Date;
  updatedAt: Date;
}

const LocalPaymentDetailsSchema = new Schema<ILocalPaymentDetails>(
  {
    method_name: { type: String, trim: true },
    account_number: { type: String, trim: true },
    instructions: { type: String, trim: true },
  },
  { _id: false }
);

const PaymentSettingsSchema = new Schema<IPaymentSettings>(
  {
    accepted_methods: {
      type: [String],
      enum: ['instapay', 'mobile_wallet', 'bank_transfer', 'cash'],
      default: ['instapay', 'mobile_wallet', 'bank_transfer'],
    },
    local_payment_details: {
      type: LocalPaymentDetailsSchema,
    },
    instapay_address: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const UserSubscriptionSchema = new Schema<IUserSubscription>(
  {
    plan_name: { type: String, default: 'Starter Free' },
    status: { type: String, enum: ['active', 'expired', 'canceled'], default: 'active' },
    expires_at: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
    },
  },
  { _id: false }
);

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false,
    },
    location: {
      governorate: {
        type: String,
        required: [true, 'Governorate is required'],
        trim: true,
      },
      address: {
        type: String,
        trim: true,
      },
    },
    role: {
      type: String,
      enum: ['Admin', 'Wholesaler', 'Retailer', 'Shipper'],
      default: 'Retailer',
      required: true,
      index: true,
    },
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    failed_login_attempts: { type: Number, default: 0, select: false },
    locked_until: { type: Date, select: false },
    email_verified_at: Date,
    session_version: { type: Number, default: 0, select: false },
    terms_accepted_at: Date,
    terms_version: String,
    deletion_requested_at: Date,
    deletion_scheduled_for: Date,
    avatar_url: { type: String, trim: true },
    cover_url: { type: String, trim: true },
    business_name: { type: String, trim: true },
    business_description: { type: String, trim: true },
    contact_methods: {
      phone: { type: String, trim: true },
      whatsapp: { type: String, trim: true },
      email: { type: String, trim: true },
    },
    interested_categories: {
      type: [String],
      default: [],
    },
    paymentSettings: {
      type: PaymentSettingsSchema,
      default: undefined,
    },
    subscription: {
      type: UserSubscriptionSchema,
      default: () => ({
        plan_name: 'Starter Free',
        status: 'active',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }),
    },
  },
  {
    timestamps: true,
  }
);

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
