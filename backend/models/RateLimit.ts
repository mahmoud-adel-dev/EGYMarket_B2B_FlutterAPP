import mongoose, { Document, Model, Schema } from 'mongoose';

interface IRateLimit extends Document {
  key: string;
  count: number;
  expires_at: Date;
}

const RateLimitSchema = new Schema<IRateLimit>(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, default: 0 },
    expires_at: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: false }
);

const RateLimit: Model<IRateLimit> =
  mongoose.models.RateLimit || mongoose.model<IRateLimit>('RateLimit', RateLimitSchema);
export default RateLimit;
