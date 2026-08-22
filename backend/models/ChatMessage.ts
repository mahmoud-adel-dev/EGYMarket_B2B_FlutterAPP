import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IChatMessage extends Document {
  conversation_id: Types.ObjectId;
  order_id?: Types.ObjectId;
  product_id?: Types.ObjectId;
  sender_user_id?: Types.ObjectId;
  sender_organization_id?: Types.ObjectId;
  client_message_id?: string;
  body: string;
  message_type: 'text' | 'system';
  event_type?: string;
  event_metadata?: Record<string, unknown>;
  read_by_organization_ids: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    conversation_id: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    order_id: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
    product_id: { type: Schema.Types.ObjectId, ref: 'Product', index: true },
    // System events (for example a platform-fee confirmation) may be emitted by
    // the platform without an organization. Text messages still set both fields
    // in the authenticated messages route.
    sender_user_id: { type: Schema.Types.ObjectId, ref: 'User' },
    sender_organization_id: { type: Schema.Types.ObjectId, ref: 'Organization' },
    // Generated once by the client and reused for retries. Legacy/system
    // messages intentionally do not have this field.
    client_message_id: { type: String, trim: true, maxlength: 64 },
    body: { type: String, required: true, trim: true, maxlength: 3000 },
    message_type: { type: String, enum: ['text', 'system'], default: 'text' },
    event_type: { type: String, trim: true, maxlength: 80, index: true },
    event_metadata: Schema.Types.Mixed,
    read_by_organization_ids: [{ type: Schema.Types.ObjectId, ref: 'Organization' }],
  },
  { timestamps: true }
);
ChatMessageSchema.index({ conversation_id: 1, createdAt: -1, _id: -1 });
ChatMessageSchema.index(
  { conversation_id: 1, sender_organization_id: 1, client_message_id: 1 },
  {
    unique: true,
    partialFilterExpression: { client_message_id: { $type: 'string' } },
  }
);

const ChatMessage: Model<IChatMessage> =
  mongoose.models.ChatMessage || mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);
export default ChatMessage;
