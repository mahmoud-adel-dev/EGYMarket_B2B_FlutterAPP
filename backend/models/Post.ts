import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type MediaType = 'video' | 'image';

export interface IPost extends Document {
  _id: Types.ObjectId;
  wholesaler_id: Types.ObjectId;
  organization_id?: Types.ObjectId;
  product_id?: Types.ObjectId;
  media_urls: string[];       // up to 8 images
  video_url?: string;         // single video (mutually exclusive with images)
  video_urls: string[];
  media_type: MediaType;
  category: string;
  caption: string;
  likes_count: number;
  createdAt: Date;
  updatedAt: Date;
}

const PostSchema = new Schema<IPost>(
  {
    wholesaler_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Wholesaler ID reference is required'],
      index: true,
    },
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
    },
    product_id: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      index: true,
    },
    media_urls: {
      type: [String],
      default: [],
      validate: {
        validator: (v: string[]) => v.length <= 8,
        message: 'A post can have at most 8 images',
      },
    },
    video_url: {
      type: String,
      trim: true,
    },
    video_urls: {
      type: [String],
      default: [],
      validate: {
        validator: (values: string[]) => values.length <= 8,
        message: 'A post can have at most 8 videos',
      },
    },
    media_type: {
      type: String,
      enum: ['video', 'image'],
      required: [true, 'Media type must be video or image'],
    },
    category: {
      type: String,
      trim: true,
      default: 'General',
      index: true,
    },
    caption: {
      type: String,
      required: [true, 'Caption is required'],
      trim: true,
      maxlength: [2000, 'Caption cannot exceed 2000 characters'],
    },
    likes_count: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

PostSchema.index({ wholesaler_id: 1, createdAt: -1 });
PostSchema.index({ organization_id: 1, createdAt: -1 });
PostSchema.index({ category: 1, createdAt: -1 });
PostSchema.index({ caption: 'text' });

const Post: Model<IPost> = mongoose.models.Post || mongoose.model<IPost>('Post', PostSchema);

export default Post;
