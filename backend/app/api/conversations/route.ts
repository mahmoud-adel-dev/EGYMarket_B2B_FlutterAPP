import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { withAuth } from '@/lib/auth/withAuth';
import ChatMessage from '@/models/ChatMessage';
import Conversation from '@/models/Conversation';
import Order from '@/models/Order';
import Product from '@/models/Product';
import PaymentObligation from '@/models/PaymentObligation';
import { createOrganizationNotification } from '@/lib/notifications/notification_service';
import { ensureOrderConversation, requireOrderChatAccess } from '@/lib/orders/order_chat';
import { StartConversationSchema } from '@/lib/validation/chat';
import {
  createIdempotentTextMessage,
  updateConversationPreview,
} from '@/lib/chat_message_service';

function orderParticipants(order: any): string[] {
  return [order.buyer_organization_id, order.seller_organization_id, order.shipper_organization_id]
    .filter(Boolean)
    .map((value) => value.toString());
}

export const GET = withAuth([], async (_req: NextRequest, _context, session) => {
  const organizationId = session.user.organizationId;
  if (!organizationId) return NextResponse.json({ success: true, conversations: [] });

  const conversations = await Conversation.find({ participant_organization_ids: organizationId })
    .populate('participant_organization_ids', 'display_name avatar_url type')
    .populate('order_id', 'order_number status buyer_organization_id seller_organization_id shipper_organization_id buyer_chat_unlocked_at')
    .populate('product_id', 'title images sku organization_id')
    .sort({ last_message_at: -1, updatedAt: -1 })
    .limit(100)
    .lean();
  // Keep locked order rooms visible as a clear paid-feature milestone, but never
  // expose their messages/unread count or allow the buyer to enter them.
  const buyerOrderIds = conversations
    .filter((conversation) => {
      const order = conversation.order_id as any;
      return conversation.conversation_type === 'order' &&
        order?._id && order.buyer_organization_id?.toString() === organizationId;
    })
    .map((conversation) => (conversation.order_id as any)._id);
  const confirmedPlatformOrderIds = buyerOrderIds.length
    ? await PaymentObligation.find({
        order_id: { $in: buyerOrderIds },
        kind: 'platform_fee',
        status: 'confirmed',
      }).distinct('order_id')
    : [];
  const confirmedPlatformSet = new Set(confirmedPlatformOrderIds.map((id) => id.toString()));
  const rowsWithAccess = conversations.map((conversation) => {
    const order = conversation.order_id as any;
    const buyerLocked = conversation.conversation_type === 'order' &&
      order?._id &&
      order.buyer_organization_id?.toString() === organizationId &&
      !order.buyer_chat_unlocked_at &&
      !confirmedPlatformSet.has(order._id.toString());
    return {
      ...conversation,
      chat_access: buyerLocked
        ? { allowed: false, reason_code: 'PLATFORM_FEE_REQUIRED' }
        : { allowed: true },
    };
  });
  const conversationIds = rowsWithAccess
    .filter((conversation) => conversation.chat_access.allowed)
    .map((conversation) => conversation._id);
  const unreadRows = await ChatMessage.aggregate<{ _id: mongoose.Types.ObjectId; unread_count: number }>([
    {
      $match: {
        conversation_id: { $in: conversationIds },
        sender_organization_id: { $ne: new mongoose.Types.ObjectId(organizationId) },
        read_by_organization_ids: { $ne: new mongoose.Types.ObjectId(organizationId) },
      },
    },
    { $group: { _id: '$conversation_id', unread_count: { $sum: 1 } } },
  ]);
  const unreadByConversationId = new Map(unreadRows.map((row) => [row._id.toString(), row.unread_count]));
  const rows = rowsWithAccess.map((conversation) => ({
    ...conversation,
    unread_count: unreadByConversationId.get(conversation._id.toString()) || 0,
  }));
  return NextResponse.json({ success: true, conversations: rows });
});

export const POST = withAuth([], async (req: NextRequest, _context, session) => {
  const data = StartConversationSchema.parse(await req.json());
  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: 'Forbidden', message: 'An organization is required' }, { status: 403 });
  }

  if (data.order_id) {
    const order = await Order.findById(data.order_id);
    if (!order) return NextResponse.json({ error: 'Not Found', message: 'Order not found' }, { status: 404 });
    const access = await requireOrderChatAccess(
      order,
      organizationId,
      session.user.role === 'Admin'
    );
    const isBuyer = order.buyer_organization_id.toString() === organizationId;
    const conversation = await ensureOrderConversation(order, isBuyer && access.allowed);
    await conversation.populate('participant_organization_ids', 'display_name avatar_url type');
    await conversation.populate('order_id', 'order_number status buyer_organization_id seller_organization_id shipper_organization_id');
    return NextResponse.json({ success: true, conversation }, { status: 201 });
  }

  if (session.user.role !== 'Retailer' && session.user.role !== 'Admin') {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Only authenticated buyers can start a product inquiry' },
      { status: 403 }
    );
  }
  const product = await Product.findOne({
    _id: data.product_id,
    status: 'active',
    isActive: true,
  }).select('title organization_id');
  if (!product?.organization_id) {
    return NextResponse.json({ error: 'Not Found', message: 'Product not found' }, { status: 404 });
  }
  const sellerOrganizationId = product.organization_id.toString();
  if (sellerOrganizationId === organizationId) {
    return NextResponse.json({ error: 'Bad Request', message: 'You cannot inquire about your own product' }, { status: 400 });
  }

  let conversation = await Conversation.findOne({
    conversation_type: 'inquiry',
    product_id: product._id,
    initiated_by_organization_id: organizationId,
  });
  const isNew = !conversation;
  if (!conversation) {
    try {
      conversation = await Conversation.create({
        conversation_type: 'inquiry',
        product_id: product._id,
        initiated_by_organization_id: organizationId,
        participant_organization_ids: [organizationId, sellerOrganizationId],
        last_message_at: new Date(),
      });
    } catch (error) {
      const duplicate = Boolean(
        error &&
          typeof error === 'object' &&
          'code' in error &&
          (error as { code?: number }).code === 11000
      );
      if (!duplicate) throw error;
      conversation = await Conversation.findOne({
        conversation_type: 'inquiry',
        product_id: product._id,
        initiated_by_organization_id: organizationId,
      });
      if (!conversation) throw error;
    }
  }

  let initialMessage = null;
  let initialMessageCreated = false;
  if (data.initial_message) {
    const result = await createIdempotentTextMessage({
      conversationId: conversation._id,
      productId: product._id,
      senderUserId: session.user.id,
      senderOrganizationId: organizationId,
      clientMessageId: data.initial_message_client_id!,
      body: data.initial_message,
    });
    initialMessage = result.message;
    initialMessageCreated = result.created;
    await updateConversationPreview(conversation._id, initialMessage);
    await initialMessage.populate('sender_organization_id', 'display_name avatar_url type');
    conversation.last_message = initialMessage.body.slice(0, 200);
    conversation.last_message_at = initialMessage.createdAt;
  }

  if ((isNew && !data.initial_message) || initialMessageCreated) {
    try {
      await createOrganizationNotification(sellerOrganizationId, {
        type: 'inquiry_received',
        title: `استفسار عن ${product.title}`,
        body: data.initial_message || `${session.user.name || 'مشتري'} بدأ استفسارًا جديدًا.`,
        metadata: {
          conversationId: conversation._id.toString(),
          productId: product._id.toString(),
          actorOrganizationId: organizationId,
        },
      });
    } catch (error) {
      console.error('Inquiry notification failed safely:', error);
    }
  }

  await conversation.populate('participant_organization_ids', 'display_name avatar_url type');
  await conversation.populate('product_id', 'title images sku organization_id');
  return NextResponse.json(
    {
      success: true,
      conversation,
      initial_message: initialMessage,
      deduplicated: Boolean(data.initial_message) && !initialMessageCreated,
    },
    { status: isNew ? 201 : 200 }
  );
});
