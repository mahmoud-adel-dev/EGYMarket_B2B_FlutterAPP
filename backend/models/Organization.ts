import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type OrganizationType = 'wholesaler' | 'buyer' | 'shipper';
export type VerificationStatus = 'unsubmitted' | 'pending' | 'verified' | 'rejected' | 'suspended';
export type LocalPaymentMethod = 'instapay' | 'mobile_wallet' | 'bank_transfer' | 'cash';

export interface IOrganizationPaymentAccount {
  method: LocalPaymentMethod;
  label: string;
  account_holder: string;
  account_reference: string;
  instructions?: string;
  is_active: boolean;
}

export interface IVerificationDocument {
  type: 'commercial_register' | 'tax_card' | 'national_id' | 'shipping_license' | 'other';
  file_url: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  uploaded_at: Date;
  reviewed_at?: Date;
  reviewed_by?: Types.ObjectId;
}

export interface IOrganization extends Document {
  _id: Types.ObjectId;
  type: OrganizationType;
  legal_name: string;
  display_name: string;
  slug: string;
  description?: string;
  phone: string;
  email: string;
  location: { governorate: string; address?: string };
  tax_number?: string;
  commercial_register_number?: string;
  avatar_url?: string;
  cover_url?: string;
  verification_status: VerificationStatus;
  verification_documents: IVerificationDocument[];
  payment_accounts: IOrganizationPaymentAccount[];
  is_active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentAccountSchema = new Schema<IOrganizationPaymentAccount>(
  {
    method: { type: String, enum: ['instapay', 'mobile_wallet', 'bank_transfer', 'cash'], required: true },
    label: { type: String, required: true, trim: true },
    account_holder: { type: String, required: true, trim: true },
    account_reference: { type: String, required: true, trim: true },
    instructions: { type: String, trim: true, maxlength: 1000 },
    is_active: { type: Boolean, default: true },
  },
  { _id: true }
);

const VerificationDocumentSchema = new Schema<IVerificationDocument>(
  {
    type: {
      type: String,
      enum: ['commercial_register', 'tax_card', 'national_id', 'shipping_license', 'other'],
      required: true,
    },
    file_url: { type: String, required: true, trim: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    rejection_reason: { type: String, trim: true },
    uploaded_at: { type: Date, default: Date.now },
    reviewed_at: Date,
    reviewed_by: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: true }
);

const OrganizationSchema = new Schema<IOrganization>(
  {
    type: { type: String, enum: ['wholesaler', 'buyer', 'shipper'], required: true, index: true },
    legal_name: { type: String, required: true, trim: true },
    display_name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String, trim: true, maxlength: 3000 },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    location: {
      governorate: { type: String, required: true, trim: true, index: true },
      address: { type: String, trim: true },
    },
    tax_number: { type: String, trim: true },
    commercial_register_number: { type: String, trim: true },
    avatar_url: { type: String, trim: true },
    cover_url: { type: String, trim: true },
    verification_status: {
      type: String,
      enum: ['unsubmitted', 'pending', 'verified', 'rejected', 'suspended'],
      default: 'unsubmitted',
      index: true,
    },
    verification_documents: { type: [VerificationDocumentSchema], default: [] },
    payment_accounts: { type: [PaymentAccountSchema], default: [] },
    is_active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

OrganizationSchema.index({ type: 1, verification_status: 1, is_active: 1 });
OrganizationSchema.index({ display_name: 'text', legal_name: 'text', description: 'text' });

const Organization: Model<IOrganization> =
  mongoose.models.Organization || mongoose.model<IOrganization>('Organization', OrganizationSchema);

export default Organization;
