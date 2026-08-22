import mongoose, { Types } from 'mongoose';
import { ApiError } from '@/lib/errors/api_error';
import ChatMessage from '@/models/ChatMessage';
import Conversation from '@/models/Conversation';
import Order, { IOrder } from '@/models/Order';
import PaymentObligation, { ObligationStatus } from '@/models/PaymentObligation';
import { decideOrderChatAccess } from '@/lib/orders/order_chat_rules';

type OrderParticipantShape = Pick<
  IOrder,
  | '_id'
  | 'buyer_organization_id'
  | 'seller_organization_id'
  | 'shipper_organization_id'
  | 'platform_fee_piasters'
  | 'buyer_chat_unlocked_at'
  | 'createdAt'
>;

export interface OrderChatAccess {
  allowed: boolean;
  reason?: 'not_participant' | 'platform_fee_required';
  code?: 'ORDER_PARTICIPANT_REQUIRED' | 'PLATFORM_FEE_REQUIRED';
  platform_fee_status: ObligationStatus | 'not_issued';
  platform_fee_amount_piasters: number;
}

function idsForOrder(order: OrderParticipantShape): string[] {
  return [order.buyer_organization_id, order.seller_organization_id, order.shipper_organization_id]
    .filter(Boolean)
    .map((value) => value!.toString());
}

/**
 * Server-side gate for the private order room. The seller and assigned shipper may
 * coordinate immediately, while the buyer is admitted only after the platform's
 * 50 EGP obligation (or the configured replacement amount) is actually confirmed.
 */
export async function evaluateOrderChatAccess(
  order: OrderParticipantShape,
  organizationId?: string,
  isAdmin = false
): Promise<OrderChatAccess> {
  const platformFee = await PaymentObligation.findOne({ order_id: order._id, kind: 'platform_fee' })
    .select('status amount_piasters')
    .lean();
  const platformStatus = platformFee?.status ?? 'not_issued';
  const platformAmount = platformFee?.amount_piasters ?? order.platform_fee_piasters;

  const isBuyer = order.buyer_organization_id.toString() === organizationId;
  const decision = decideOrderChatAccess({
    isAdmin,
    isParticipant: Boolean(organizationId && idsForOrder(order).includes(organizationId)),
    isBuyer,
    buyerChatUnlocked: Boolean(order.buyer_chat_unlocked_at),
    platformFeeStatus: platformStatus,
  });
  return {
    ...decision,
    platform_fee_status: platformStatus,
    platform_fee_amount_piasters: platformAmount,
  };
}

export async function requireOrderChatAccess(
  order: OrderParticipantShape,
  organizationId?: string,
  isAdmin = false
): Promise<OrderChatAccess> {
  const access = await evaluateOrderChatAccess(order, organizationId, isAdmin);
  if (access.allowed) return access;
  if (access.code === 'PLATFORM_FEE_REQUIRED') {
    throw new ApiError(
      402,
      'Confirm the platform order fee before entering the private order chat',
      access.code,
      access
    );
  }
  throw new ApiError(403, 'Only the contracted order parties can access this chat', access.code, access);
}

export async function ensureOrderConversation(order: OrderParticipantShape, includeBuyer = false) {
  const buyerId = order.buyer_organization_id.toString();
  const participantIds = idsForOrder(order)
    .filter((id) => id !== buyerId || includeBuyer || Boolean(order.buyer_chat_unlocked_at))
    .map((id) => new mongoose.Types.ObjectId(id));
  return Conversation.findOneAndUpdate(
    { order_id: order._id },
    {
      $set: {
        conversation_type: 'order',
        participant_organization_ids: participantIds,
      },
      $setOnInsert: { last_message_at: order.createdAt },
    },
    { upsert: true, new: true }
  );
}

export interface AppendOrderEventInput {
  order: OrderParticipantShape;
  body: string;
  eventType: string;
  actorUserId?: string;
  actorOrganizationId?: string;
  metadata?: Record<string, unknown>;
}

/** Append an immutable domain event to the same room the three parties see. */
export async function appendOrderSystemEvent(input: AppendOrderEventInput) {
  const conversation = await ensureOrderConversation(input.order);
  const readBy = input.actorOrganizationId && Types.ObjectId.isValid(input.actorOrganizationId)
    ? [new Types.ObjectId(input.actorOrganizationId)]
    : [];
  const message = await ChatMessage.create({
    conversation_id: conversation._id,
    order_id: input.order._id,
    ...(input.actorUserId && Types.ObjectId.isValid(input.actorUserId)
      ? { sender_user_id: new Types.ObjectId(input.actorUserId) }
      : {}),
    ...(input.actorOrganizationId && Types.ObjectId.isValid(input.actorOrganizationId)
      ? { sender_organization_id: new Types.ObjectId(input.actorOrganizationId) }
      : {}),
    body: input.body,
    message_type: 'system',
    event_type: input.eventType,
    event_metadata: input.metadata,
    read_by_organization_ids: readBy,
  });
  conversation.last_message = input.body.slice(0, 200);
  conversation.last_message_at = message.createdAt;
  await conversation.save();
  return { conversation, message };
}

export async function loadOrderForConversation(orderId: mongoose.Types.ObjectId | string) {
  return Order.findById(orderId).select(
    'buyer_organization_id seller_organization_id shipper_organization_id platform_fee_piasters buyer_chat_unlocked_at createdAt'
  );
}

/** Persist the paid milestone and atomically add the buyer to the private room. */
export async function unlockBuyerOrderChat(orderId: mongoose.Types.ObjectId | string) {
  let order = await Order.findOneAndUpdate(
    { _id: orderId, buyer_chat_unlocked_at: { $exists: false } },
    { $set: { buyer_chat_unlocked_at: new Date() } },
    { new: true }
  );
  order ??= await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found', 'NOT_FOUND');
  const conversation = await ensureOrderConversation(order, true);
  return { order, conversation };
}
