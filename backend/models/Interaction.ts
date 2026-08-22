import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IInteraction extends Document {
  _id: Types.ObjectId;
  post_id: Types.ObjectId;
  retailer_id: Types.ObjectId;
  comment: string;
  createdAt: Date;
  updatedAt: Date;
}

const InteractionSchema = new Schema<IInteraction>(
  {
    post_id: {
      type: Schema.Types.ObjectId,
      ref: 'Post',
      required: [true, 'Post ID reference is required'],
      index: true,
    },
    retailer_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Retailer ID reference is required'],
      index: true,
    },
    comment: {
      type: String,
      required: [true, 'Comment content is required'],
      trim: true,
      maxlength: [500, 'Comment cannot exceed 500 characters'],
    },
  },
  {
    timestamps: true,
  }
);

InteractionSchema.index({ post_id: 1, createdAt: -1 });

const Interaction: Model<IInteraction> =
  mongoose.models.Interaction || mongoose.model<IInteraction>('Interaction', InteractionSchema);

export default Interaction;
