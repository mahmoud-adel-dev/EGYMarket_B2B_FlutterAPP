import mongoose from 'mongoose';
import ChatMessage, { IChatMessage } from '@/models/ChatMessage';
import Conversation from '@/models/Conversation';
import { ApiError } from '@/lib/errors/api_error';

export interface CreateIdempotentTextMessageInput {
  conversationId: mongoose.Types.ObjectId;
  orderId?: mongoose.Types.ObjectId;
  productId?: mongoose.Types.ObjectId;
  senderUserId: string;
  senderOrganizationId: string;
  clientMessageId: string;
  body: string;
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: number }).code === 11000
  );
}

/**
 * Creates a text message once for a client-generated id. Concurrent retries are
 * reconciled through the compound unique index on ChatMessage.
 */
export async function createIdempotentTextMessage(
  input: CreateIdempotentTextMessageInput
): Promise<{ message: IChatMessage; created: boolean }> {
  const identity = {
    conversation_id: input.conversationId,
    sender_organization_id: new mongoose.Types.ObjectId(input.senderOrganizationId),
    client_message_id: input.clientMessageId,
  };

  const existing = await ChatMessage.findOne(identity);
  if (existing) {
    if (existing.body !== input.body) {
      throw new ApiError(
        409,
        'client_message_id was already used for different content',
        'CLIENT_MESSAGE_ID_CONFLICT'
      );
    }
    return { message: existing, created: false };
  }

  try {
    const message = await ChatMessage.create({
      ...identity,
      order_id: input.orderId,
      product_id: input.productId,
      sender_user_id: new mongoose.Types.ObjectId(input.senderUserId),
      body: input.body,
      message_type: 'text',
      read_by_organization_ids: [identity.sender_organization_id],
    });
    return { message, created: true };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const duplicate = await ChatMessage.findOne(identity);
    if (!duplicate) throw error;
    if (duplicate.body !== input.body) {
      throw new ApiError(
        409,
        'client_message_id was already used for different content',
        'CLIENT_MESSAGE_ID_CONFLICT'
      );
    }
    return { message: duplicate, created: false };
  }
}

/** Keep the conversation preview monotonic when messages are sent concurrently. */
export async function updateConversationPreview(
  conversationId: mongoose.Types.ObjectId,
  message: IChatMessage
) {
  await Conversation.updateOne(
    {
      _id: conversationId,
      $or: [
        { last_message_at: { $exists: false } },
        { last_message_at: { $lte: message.createdAt } },
      ],
    },
    {
      $set: {
        last_message: message.body.slice(0, 200),
        last_message_at: message.createdAt,
      },
    }
  );
}
