import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { OrganizationMemberRole } from '@/types/next-auth';

export interface IOrganizationMember extends Document {
  _id: Types.ObjectId;
  organization_id: Types.ObjectId;
  user_id: Types.ObjectId;
  role: OrganizationMemberRole;
  permissions: string[];
  status: 'active' | 'invited' | 'disabled';
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationMemberSchema = new Schema<IOrganizationMember>(
  {
    organization_id: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['owner', 'manager', 'staff'], required: true, default: 'staff' },
    permissions: { type: [String], default: [] },
    status: { type: String, enum: ['active', 'invited', 'disabled'], default: 'active', index: true },
  },
  { timestamps: true }
);

OrganizationMemberSchema.index({ organization_id: 1, user_id: 1 }, { unique: true });

const OrganizationMember: Model<IOrganizationMember> =
  mongoose.models.OrganizationMember ||
  mongoose.model<IOrganizationMember>('OrganizationMember', OrganizationMemberSchema);

export default OrganizationMember;
