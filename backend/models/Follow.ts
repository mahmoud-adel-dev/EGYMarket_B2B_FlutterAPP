import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IFollow extends Document {
  follower_organization_id: Types.ObjectId;
  wholesaler_organization_id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FollowSchema = new Schema<IFollow>(
  {
    follower_organization_id: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    wholesaler_organization_id: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  },
  { timestamps: true }
);

FollowSchema.index(
  { follower_organization_id: 1, wholesaler_organization_id: 1 },
  { unique: true }
);

const Follow: Model<IFollow> = mongoose.models.Follow || mongoose.model<IFollow>('Follow', FollowSchema);
export default Follow;
