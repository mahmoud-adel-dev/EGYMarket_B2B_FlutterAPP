import mongoose from 'mongoose';
import type { SessionContext } from '@/lib/auth/withAuth';
import { ApiError } from '@/lib/errors/api_error';
import { evaluateOrderChatAccess } from '@/lib/orders/order_chat';
import { evaluateOrderAttention } from '@/lib/orders/order_attention';
import {
  orderAttentionActorFromSession,
  toAttentionObligation,
  toAttentionOrder,
} from '@/lib/orders/order_attention_service';
import { isOrderActionAllowed, OrderAction } from '@/lib/orders/order_rules';
import Conversation from '@/models/Conversation';
import Order from '@/models/Order';
import OrderTrackingEvent from '@/models/OrderTrackingEvent';
import PaymentObligation from '@/models/PaymentObligation';

const ORDER_ACTIONS: OrderAction[] = [
  'accept',
  'reject',
  'mark_ready',
  'confirm_pickup',
  'confirm_delivery',
  'confirm_receipt',
  'cancel',
  'open_dispute',
  'resolve_dispute_complete',
  'resolve_dispute_cancel',
];

const MANAGEMENT_ACTIONS: OrderAction[] = [
  'accept',
  'reject',
  'mark_ready',
  'confirm_receipt',
  'cancel',
  'open_dispute',
];

/**
 * Canonical participant-scoped order representation used after reads and mutations.
 * It keeps authorization, payment visibility, available actions and attention tasks
 * identical regardless of the route that returns the order.
 */
export async function getCanonicalOrderDetail(orderId: string, session: SessionContext) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new ApiError(400, 'Invalid order id');
  }

  const orderDoc = await Order.findById(orderId);
  if (!orderDoc) throw new ApiError(404, 'Order not found', 'NOT_FOUND');

  const organizationId = session.user.organizationId;
  const isAdmin = session.user.role === 'Admin';
  const isBuyer = orderDoc.buyer_organization_id.toString() === organizationId;
  const isSeller = orderDoc.seller_organization_id.toString() === organizationId;
  const isShipper = orderDoc.shipper_organization_id?.toString() === organizationId;
  if (!isAdmin && !isBuyer && !isSeller && !isShipper) {
    throw new ApiError(403, 'Order belongs to other organizations');
  }

  const [chatAccess, obligations] = await Promise.all([
    evaluateOrderChatAccess(orderDoc, organizationId, isAdmin),
    PaymentObligation.find({ order_id: orderId }).sort({ kind: 1 }).lean(),
  ]);
  const [conversation, trackingEvents] = await Promise.all([
    chatAccess.allowed
      ? Conversation.findOne({ order_id: orderId }).select('_id').lean()
      : null,
    chatAccess.allowed
      ? OrderTrackingEvent.find({ order_id: orderId })
          .populate('created_by_organization_id', 'display_name avatar_url type')
          .sort({ occurred_at: 1, _id: 1 })
          .lean()
      : [],
  ]);

  const visibleObligations = isAdmin || isBuyer
    ? obligations
    : obligations.filter((obligation) =>
        (isSeller && obligation.kind === 'goods') ||
        (isShipper && obligation.kind === 'shipping')
      );
  const confirmedCount = obligations.filter((obligation) => obligation.status === 'confirmed').length;
  const allConfirmed = obligations.length > 0 && confirmedCount === obligations.length;
  const paymentState = obligations.length === 0
    ? 'not_issued'
    : allConfirmed
      ? 'paid'
      : confirmedCount > 0 || obligations.some((obligation) => obligation.status === 'proof_submitted')
        ? 'partial'
        : 'pending';

  const ruleContext = {
    status: orderDoc.status,
    fulfillmentMethod: orderDoc.fulfillment_method,
    isBuyer,
    isSeller,
    isShipper: Boolean(isShipper),
    isAdmin,
  } as const;
  const canManage = isAdmin || ['owner', 'manager'].includes(session.user.organizationMemberRole ?? '');
  const allowedActions: string[] = ORDER_ACTIONS.filter((action) =>
    isOrderActionAllowed(action, ruleContext) &&
    (!MANAGEMENT_ACTIONS.includes(action) || canManage)
  );
  if (isShipper && orderDoc.status === 'in_transit') {
    allowedActions.push('add_tracking_checkpoint');
  }

  const attention = evaluateOrderAttention(
    toAttentionOrder(orderDoc),
    obligations.map(toAttentionObligation),
    orderAttentionActorFromSession(session)
  );

  await orderDoc.populate([
    { path: 'buyer_organization_id', select: 'display_name avatar_url location phone' },
    { path: 'seller_organization_id', select: 'display_name avatar_url location phone' },
    { path: 'shipper_organization_id', select: 'display_name avatar_url location phone' },
  ]);

  return {
    order: orderDoc.toObject(),
    payment_obligations: visibleObligations,
    payment_summary: {
      state: paymentState,
      confirmed_count: confirmedCount,
      total_count: obligations.length,
    },
    chat_access: {
      allowed: chatAccess.allowed,
      reason_code: chatAccess.code,
      platform_fee_status: chatAccess.platform_fee_status,
      platform_fee_amount_piasters: chatAccess.platform_fee_amount_piasters,
      conversation_id: conversation?._id?.toString(),
    },
    allowed_actions: allowedActions,
    tracking_events: trackingEvents,
    attention,
  };
}
