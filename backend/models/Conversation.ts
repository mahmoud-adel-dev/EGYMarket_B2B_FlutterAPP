import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IConversation extends Document {
  conversation_type: 'order' | 'inquiry';
  order_id?: Types.ObjectId;
  product_id?: Types.ObjectId;
  initiated_by_organization_id?: Types.ObjectId;
  participant_organization_ids: Types.ObjectId[];
  last_message?: string;
  last_message_at?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    conversation_type: { type: String, enum: ['order', 'inquiry'], required: true, default: 'order', index: true },
    order_id: { type: Schema.Types.ObjectId, ref: 'Order' },
    product_id: { type: Schema.Types.ObjectId, ref: 'Product', index: true },
    initiated_by_organization_id: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    participant_organization_ids: [{ type: Schema.Types.ObjectId, ref: 'Organization', required: true }],
    last_message: { type: String, trim: true, maxlength: 200 },
    last_message_at: { type: Date, index: true },
  },
  { timestamps: true }
);
ConversationSchema.index({ participant_organization_ids: 1, last_message_at: -1 });
ConversationSchema.index({ order_id: 1 }, { unique: true, sparse: true });
ConversationSchema.index(
  { product_id: 1, initiated_by_organization_id: 1 },
  { unique: true, partialFilterExpression: { conversation_type: 'inquiry' } }
);

const Conversation: Model<IConversation> =
  mongoose.models.Conversation || mongoose.model<IConversation>('Conversation', ConversationSchema);
export default Conversation;
