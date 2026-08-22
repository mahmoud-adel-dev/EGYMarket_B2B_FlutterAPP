import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { withAuth } from '@/lib/auth/withAuth';
import ChatMessage from '@/models/ChatMessage';
import Conversation from '@/models/Conversation';
import { createOrganizationNotification } from '@/lib/notifications/notification_service';
import { loadOrderForConversation, requireOrderChatAccess } from '@/lib/orders/order_chat';
import { ApiError } from '@/lib/errors/api_error';
import { SendChatMessageSchema, parseChatMessageCursor } from '@/lib/validation/chat';
import {
  createIdempotentTextMessage,
  updateConversationPreview,
} from '@/lib/chat_message_service';

async function accessibleConversation(id: string, organizationId?: string, isAdmin = false) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const conversation = await Conversation.findById(id);
  if (!conversation) return null;
  if (conversation.conversation_type === 'order' && conversation.order_id) {
    const order = await loadOrderForConversation(conversation.order_id);
    if (!order) return null;
    await requireOrderChatAccess(order, organizationId, isAdmin);
  } else if (!isAdmin && (!organizationId || !conversation.participant_organization_ids.some(
    (participantId) => participantId.toString() === organizationId
  ))) {
    return null;
  }
  return conversation;
}

export const GET = withAuth([], async (req: NextRequest, context, session) => {
  const params = await context.params;
  const id = params?.id as string;
  const conversation = await accessibleConversation(id, session.user.organizationId, session.user.role === 'Admin');
  if (!conversation) {
    return NextResponse.json({ error: 'Not Found', message: 'Conversation not found' }, { status: 404 });
  }
  const searchParams = new URL(req.url).searchParams;
  const before = parseChatMessageCursor(
    searchParams.get('before'),
    searchParams.get('before_id')
  );
  const after = parseChatMessageCursor(
    searchParams.get('after'),
    searchParams.get('after_id')
  );
  if (before && after) {
    throw new ApiError(400, 'Use either before or after cursor, not both', 'INVALID_CURSOR');
  }
  const filter: Record<string, unknown> = { conversation_id: conversation._id };
  if (before) {
    filter.$or = [
      { createdAt: { $lt: before.createdAt } },
      { createdAt: before.createdAt, _id: { $lt: before.id } },
    ];
  } else if (after) {
    filter.$or = [
      { createdAt: { $gt: after.createdAt } },
      { createdAt: after.createdAt, _id: { $gt: after.id } },
    ];
  }
  const direction = after ? 1 : -1;
  const result = await ChatMessage.find(filter)
    .populate('sender_organization_id', 'display_name avatar_url type')
    .sort({ createdAt: direction, _id: direction })
    .limit(101)
    .lean();
  const hasMore = result.length > 100;
  if (hasMore) result.pop();
  const messages = after ? result : result.reverse();
  if (session.user.organizationId) {
    await ChatMessage.updateMany(
      { conversation_id: conversation._id, read_by_organization_ids: { $ne: session.user.organizationId } },
      { $addToSet: { read_by_organization_ids: session.user.organizationId } }
    );
  }
  return NextResponse.json({
    success: true,
    conversation_id: id,
    conversation_type: conversation.conversation_type,
    order_id: conversation.order_id,
    messages,
    page: {
      has_more: hasMore,
      oldest_cursor: messages.length
        ? {
            created_at: messages[0].createdAt,
            id: messages[0]._id.toString(),
          }
        : null,
      latest_cursor: messages.length
        ? {
            created_at: messages[messages.length - 1].createdAt,
            id: messages[messages.length - 1]._id.toString(),
          }
        : null,
    },
  });
});

export const POST = withAuth([], async (req: NextRequest, context, session) => {
  const params = await context.params;
  const id = params?.id as string;
  const conversation = await accessibleConversation(id, session.user.organizationId, session.user.role === 'Admin');
  if (!conversation || !session.user.organizationId) {
    return NextResponse.json({ error: 'Not Found', message: 'Conversation not found' }, { status: 404 });
  }
  const data = SendChatMessageSchema.parse(await req.json());
  const { message, created } = await createIdempotentTextMessage({
    conversationId: conversation._id,
    orderId: conversation.order_id,
    productId: conversation.product_id,
    senderUserId: session.user.id,
    senderOrganizationId: session.user.organizationId,
    clientMessageId: data.client_message_id,
    body: data.body,
  });
  await updateConversationPreview(conversation._id, message);
  await message.populate('sender_organization_id', 'display_name avatar_url type');
  if (created) {
    const otherOrganizations = conversation.participant_organization_ids.filter(
      (organizationId) => organizationId.toString() !== session.user.organizationId
    );
    try {
      await Promise.all(
        otherOrganizations.map((organizationId) =>
          createOrganizationNotification(organizationId, {
            type: 'message_received',
            title: 'رسالة جديدة',
            body: `${session.user.name || 'مستخدم'}: ${data.body.slice(0, 140)}`,
            orderId: conversation.order_id,
            metadata: {
              conversationId: conversation._id.toString(),
              productId: conversation.product_id?.toString(),
              actorOrganizationId: session.user.organizationId,
            },
          })
        )
      );
    } catch (error) {
      console.error('Chat notification fan-out failed safely:', error);
    }
  }
  return NextResponse.json(
    { success: true, message, deduplicated: !created },
    { status: created ? 201 : 200 }
  );
});
