import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IPostLike extends Document {
  post_id: Types.ObjectId;
  user_id: Types.ObjectId;
  organization_id?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PostLikeSchema = new Schema<IPostLike>(
  {
    post_id: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    organization_id: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
  },
  { timestamps: true }
);

PostLikeSchema.index({ post_id: 1, user_id: 1 }, { unique: true });

const PostLike: Model<IPostLike> =
  mongoose.models.PostLike || mongoose.model<IPostLike>('PostLike', PostLikeSchema);

export default PostLike;
