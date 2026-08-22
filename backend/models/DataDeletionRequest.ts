import mongoose, { Document, Model, Schema, Types } from 'mongoose';

interface IDataDeletionRequest extends Document {
  user_id: Types.ObjectId;
  organization_id?: Types.ObjectId;
  status: 'scheduled' | 'completed' | 'canceled';
  requested_at: Date;
  scheduled_for: Date;
  completed_at?: Date;
}

const DataDeletionRequestSchema = new Schema<IDataDeletionRequest>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    organization_id: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    status: { type: String, enum: ['scheduled', 'completed', 'canceled'], default: 'scheduled', index: true },
    requested_at: { type: Date, default: Date.now },
    scheduled_for: { type: Date, required: true, index: true },
    completed_at: Date,
  },
  { timestamps: true }
);

const DataDeletionRequest: Model<IDataDeletionRequest> =
  mongoose.models.DataDeletionRequest ||
  mongoose.model<IDataDeletionRequest>('DataDeletionRequest', DataDeletionRequestSchema);
export default DataDeletionRequest;
