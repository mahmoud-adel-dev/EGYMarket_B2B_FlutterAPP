import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IDispute extends Document {
  _id: Types.ObjectId;
  order_id: Types.ObjectId;
  opened_by_user_id: Types.ObjectId;
  opened_by_organization_id?: Types.ObjectId;
  reason: string;
  evidence_urls: string[];
  status: 'open' | 'in_review' | 'resolved' | 'rejected';
  resolution?: string;
  resolved_by?: Types.ObjectId;
  resolved_at?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DisputeSchema = new Schema<IDispute>(
  {
    // Covered by the compound and partial indexes declared below. Adding
    // `index: true` here produced a duplicate { order_id: 1 } schema index.
    order_id: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    opened_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Optional: platform admins may open disputes without belonging to an organization.
    opened_by_organization_id: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    reason: { type: String, required: true, trim: true, maxlength: 3000 },
    evidence_urls: { type: [String], default: [] },
    status: { type: String, enum: ['open', 'in_review', 'resolved', 'rejected'], default: 'open', index: true },
    resolution: { type: String, trim: true, maxlength: 3000 },
    resolved_by: { type: Schema.Types.ObjectId, ref: 'User' },
    resolved_at: Date,
  },
  { timestamps: true }
);

DisputeSchema.index({ order_id: 1, status: 1 });
// At most one active dispute per order; resolved/rejected disputes are exempt.
DisputeSchema.index(
  { order_id: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['open', 'in_review'] } } }
);
const Dispute: Model<IDispute> = mongoose.models.Dispute || mongoose.model<IDispute>('Dispute', DisputeSchema);
export default Dispute;
