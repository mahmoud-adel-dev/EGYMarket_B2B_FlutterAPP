import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IVerificationToken extends Document {
  user_id: Types.ObjectId;
  purpose: 'verify_email' | 'reset_password';
  token_hash: string;
  expires_at: Date;
  used_at?: Date;
  createdAt: Date;
}

const VerificationTokenSchema = new Schema<IVerificationToken>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    purpose: { type: String, enum: ['verify_email', 'reset_password'], required: true, index: true },
    token_hash: { type: String, required: true, unique: true },
    expires_at: { type: Date, required: true, index: { expires: 0 } },
    used_at: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const VerificationToken: Model<IVerificationToken> =
  mongoose.models.VerificationToken ||
  mongoose.model<IVerificationToken>('VerificationToken', VerificationTokenSchema);
export default VerificationToken;
