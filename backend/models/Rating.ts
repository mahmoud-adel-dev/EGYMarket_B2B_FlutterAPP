import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type RatingTargetType = 'wholesaler' | 'product';

export interface IRating extends Document {
  _id: Types.ObjectId;
  target_type: RatingTargetType;
  target_id: Types.ObjectId;
  user_id: Types.ObjectId;
  rating: number; // 1 to 5
  review?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RatingSchema = new Schema<IRating>(
  {
    target_type: {
      type: String,
      enum: ['wholesaler', 'product'],
      required: true,
    },
    target_id: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: [true, 'Rating value is required'],
      min: [1, 'Rating must be at least 1 star'],
      max: [5, 'Rating cannot exceed 5 stars'],
    },
    review: {
      type: String,
      trim: true,
      maxlength: [1000, 'Review cannot exceed 1000 characters'],
    },
  },
  {
    timestamps: true,
  }
);

RatingSchema.index({ target_id: 1, target_type: 1 });
RatingSchema.index({ user_id: 1, target_id: 1 }, { unique: true });

const Rating: Model<IRating> =
  mongoose.models.Rating || mongoose.model<IRating>('Rating', RatingSchema);

export default Rating;
