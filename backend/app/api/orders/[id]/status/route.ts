import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { withAuth } from '@/lib/auth/withAuth';
import { OrderActionSchema } from '@/lib/validation/order';
import { ApiError } from '@/lib/errors/api_error';
import {
  acceptOrder,
  cancelOrderByBuyer,
  confirmReceipt,
  openOrderDispute,
  resolveDisputeAsCanceled,
  resolveDisputeAsCompleted,
  simpleTransition,
} from '@/lib/orders/order_service';
import Order, { IOrder, OrderStatus } from '@/models/Order';
import OrderTrackingEvent from '@/models/OrderTrackingEvent';
import Dispute from '@/models/Dispute';
import { createOrganizationNotification } from '@/lib/notifications/notification_service';
import { isOrderActionAllowed } from '@/lib/orders/order_rules';
import { appendOrderSystemEvent } from '@/lib/orders/order_chat';
import { getCanonicalOrderDetail } from '@/lib/orders/order_detail_dto';
import { checkIdentityRateLimit } from '@/lib/auth/rate_limit';

export const PATCH = withAuth([], async (req: NextRequest, context, session) => {
  // R-1: per-organization cap on order-state mutations (anti-flood / anti-abuse).
  const limited = await checkIdentityRateLimit(
    `org:${session.user.organizationId ?? 'none'}:order-status`,
    'order-status',
    60,
    60_000
  );
  if (limited.isRateLimited) return limited.response!;
  const params = await context.params;
  const id = params?.id as string;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, 'Invalid order id');
  const { action, note } = OrderActionSchema.parse(await req.json());
  const order = await Order.findById(id);
  if (!order) throw new ApiError(404, 'Order not found', 'NOT_FOUND');

  const organizationId = session.user.organizationId;
  const isAdmin = session.user.role === 'Admin';
  const isBuyer = organizationId ? order.buyer_organization_id.toString() === organizationId : false;
  const isSeller = organizationId ? order.seller_organization_id.toString() === organizationId : false;
  const isShipper = organizationId ? order.shipper_organization_id?.toString() === organizationId : false;
  if (!isAdmin && !isBuyer && !isSeller && !isShipper) throw new ApiError(403, 'Order belongs to other organizations');
  if (!isOrderActionAllowed(action, {
    status: order.status,
    fulfillmentMethod: order.fulfillment_method,
    isBuyer,
    isSeller,
    isShipper: Boolean(isShipper),
    isAdmin,
  })) {
    throw new ApiError(409, 'This action is not allowed for the current order state and participant');
  }
  const requiresManagement = ['accept', 'reject', 'mark_ready', 'confirm_receipt', 'cancel', 'open_dispute'].includes(action);
  if (!isAdmin && requiresManagement && !['owner', 'manager'].includes(session.user.organizationMemberRole || '')) {
    throw new ApiError(403, 'Only an organization owner or manager can perform this order action', 'ORG_PERMISSION_REQUIRED');
  }

  const actor = { userId: session.user.id, role: session.user.role, organizationId };
  let nextStatus: OrderStatus;
  let updatedOrder: IOrder;
  switch (action) {
    case 'accept': {
      updatedOrder = await acceptOrder(id, actor);
      nextStatus = 'awaiting_payments';
      break;
    }
    case 'reject':
      if (!note) throw new ApiError(400, 'Rejection reason is required');
      updatedOrder = await simpleTransition(id, ['requested'], 'rejected', actor, {}, note);
      nextStatus = 'rejected';
      break;
    case 'mark_ready':
      updatedOrder = await simpleTransition(id, ['preparing'], 'ready_for_pickup', actor);
      nextStatus = 'ready_for_pickup';
      break;
    case 'confirm_pickup':
      updatedOrder = await simpleTransition(id, ['ready_for_pickup'], 'in_transit', actor);
      nextStatus = 'in_transit';
      break;
    case 'confirm_delivery':
      updatedOrder = await simpleTransition(id, ['in_transit'], 'delivered', actor);
      nextStatus = 'delivered';
      break;
    case 'confirm_receipt': {
      updatedOrder = await confirmReceipt(order, actor);
      nextStatus = 'completed';
      break;
    }
    case 'cancel': {
      if (!note) throw new ApiError(400, 'Cancellation reason is required');
      updatedOrder = await cancelOrderByBuyer(order, note, actor);
      nextStatus = 'canceled';
      break;
    }
    case 'open_dispute': {
      // Disputes are opened by participants; admins manage resolution instead.
      if (!note) throw new ApiError(400, 'Dispute reason is required');
      const result = await openOrderDispute(order, { reason: note, evidence_urls: [] }, actor);
      updatedOrder = result.order;
      nextStatus = 'disputed';
      break;
    }
    case 'resolve_dispute_complete': {
      if (!note) throw new ApiError(400, 'Resolution summary is required');
      const dispute = await requireActiveDispute(order._id);
      const result = await resolveDisputeAsCompleted(dispute._id.toString(), note, actor);
      updatedOrder = result.order;
      nextStatus = 'completed';
      break;
    }
    case 'resolve_dispute_cancel': {
      if (!note) throw new ApiError(400, 'Resolution summary is required');
      const dispute = await requireActiveDispute(order._id);
      const result = await resolveDisputeAsCanceled(dispute._id.toString(), note, actor);
      updatedOrder = result.order;
      nextStatus = 'canceled';
      break;
    }
    default:
      throw new ApiError(400, 'Unsupported action');
  }

  const eventByAction: Record<string, { type: string; body: string }> = {
    accept: { type: 'order_accepted', body: 'قبل البائع الطلب وأصدر التزامات الدفع' },
    reject: { type: 'order_rejected', body: `رفض البائع الطلب${note ? `: ${note}` : ''}` },
    mark_ready: { type: 'order_ready', body: 'أكد البائع اكتمال تجهيز الطلبية' },
    confirm_pickup: { type: 'shipment_started', body: 'استلمت شركة الشحن الطلبية وخرجت للشحن' },
    confirm_delivery: { type: 'shipment_delivered', body: 'أكدت شركة الشحن تسليم الطلبية إلى المشتري' },
    confirm_receipt: { type: 'buyer_received', body: 'أكد المشتري استلام الطلبية' },
    cancel: { type: 'order_canceled', body: `ألغى المشتري الطلب${note ? `: ${note}` : ''}` },
    open_dispute: { type: 'dispute_opened', body: `تم فتح نزاع على الطلب: ${note || ''}` },
    resolve_dispute_complete: { type: 'dispute_resolved_complete', body: `حُسم النزاع بإكمال الطلب: ${note || ''}` },
    resolve_dispute_cancel: { type: 'dispute_resolved_cancel', body: `حُسم النزاع بإلغاء الطلب: ${note || ''}` },
  };
  const event = eventByAction[action];

  if (action === 'confirm_pickup' && organizationId) {
    await OrderTrackingEvent.create({
      order_id: updatedOrder._id,
      event_type: 'picked_up',
      location: 'تم الاستلام من البائع',
      note,
      created_by_user_id: session.user.id,
      created_by_organization_id: organizationId,
      occurred_at: new Date(),
    });
  } else if (action === 'confirm_delivery' && organizationId) {
    await OrderTrackingEvent.create({
      order_id: updatedOrder._id,
      event_type: 'delivered',
      location: order.shipping_address?.address || order.shipping_address?.governorate || 'عنوان المشتري',
      note,
      created_by_user_id: session.user.id,
      created_by_organization_id: organizationId,
      occurred_at: new Date(),
    });
  }

  await appendOrderSystemEvent({
    order: updatedOrder,
    body: event.body,
    eventType: event.type,
    actorUserId: session.user.id,
    actorOrganizationId: organizationId,
    metadata: { action, status: nextStatus, note },
  });

  const notificationType = nextStatus === 'rejected'
    ? 'order_rejected'
    : nextStatus === 'completed'
      ? 'order_confirmed'
      : nextStatus === 'in_transit'
        ? 'order_picked_up'
        : nextStatus === 'delivered'
          ? 'order_delivered'
          : 'order_accepted';
  const recipients = [order.buyer_organization_id, order.seller_organization_id, order.shipper_organization_id]
    .filter(Boolean)
    .filter((recipient) => recipient!.toString() !== organizationId)
    .filter((recipient, index, values) => values.findIndex((value) => value!.toString() === recipient!.toString()) === index);
  await Promise.all(recipients.map((recipientOrganization) => createOrganizationNotification(recipientOrganization!, {
    type: notificationType,
    title: `تحديث الطلب ${order.order_number}`,
    body: `حالة الطلب الآن: ${nextStatus}`,
    orderId: order._id,
  })));

  const detail = await getCanonicalOrderDetail(id, session);
  return NextResponse.json({ success: true, message: 'Order updated', ...detail });
});

async function requireActiveDispute(orderId: mongoose.Types.ObjectId) {
  const dispute = await Dispute.findOne({ order_id: orderId, status: { $in: ['open', 'in_review'] } });
  if (!dispute) throw new ApiError(404, 'No active dispute found for this order', 'NOT_FOUND');
  return dispute;
}
