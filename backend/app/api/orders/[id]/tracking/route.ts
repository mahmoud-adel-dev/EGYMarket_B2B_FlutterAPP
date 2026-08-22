import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { ApiError } from '@/lib/errors/api_error';
import { appendOrderSystemEvent, requireOrderChatAccess } from '@/lib/orders/order_chat';
import { TrackingEventSchema } from '@/lib/validation/order';
import Order from '@/models/Order';
import OrderTrackingEvent, { IOrderTrackingEvent } from '@/models/OrderTrackingEvent';
import { createOrganizationNotification } from '@/lib/notifications/notification_service';

export const GET = withAuth([], async (_req: NextRequest, context, session) => {
  const params = await context.params;
  const id = params?.id as string;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, 'Invalid order id');
  const order = await Order.findById(id);
  if (!order) throw new ApiError(404, 'Order not found', 'NOT_FOUND');
  await requireOrderChatAccess(order, session.user.organizationId, session.user.role === 'Admin');
  const trackingEvents = await OrderTrackingEvent.find({ order_id: order._id })
    .populate('created_by_organization_id', 'display_name avatar_url type')
    .sort({ occurred_at: 1, _id: 1 })
    .lean();
  return NextResponse.json({ success: true, tracking_events: trackingEvents });
});

export const POST = withAuth(['Shipper'], async (req: NextRequest, context, session) => {
  const params = await context.params;
  const id = params?.id as string;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, 'Invalid order id');
  const data = TrackingEventSchema.parse(await req.json());
  const order = await Order.findById(id);
  if (!order) throw new ApiError(404, 'Order not found', 'NOT_FOUND');
  if (!session.user.organizationId || order.shipper_organization_id?.toString() !== session.user.organizationId) {
    throw new ApiError(403, 'Only the shipping company assigned to this order can add tracking updates', 'SHIPPER_NOT_ASSIGNED');
  }
  if (order.fulfillment_method !== 'third_party_shipping' || order.status !== 'in_transit') {
    throw new ApiError(409, 'Tracking updates are allowed only while the assigned shipment is in transit', 'TRACKING_EVENT_NOT_ALLOWED');
  }

  if (data.client_event_id) {
    const existing = await OrderTrackingEvent.findOne({
      order_id: order._id,
      client_event_id: data.client_event_id,
    });
    if (existing) {
      return NextResponse.json({ success: true, tracking_event: existing, idempotent_replay: true });
    }
  }

  let trackingEvent: IOrderTrackingEvent;
  try {
    trackingEvent = await OrderTrackingEvent.create({
      order_id: order._id,
      event_type: data.event_type,
      location: data.location,
      note: data.note,
      occurred_at: data.occurred_at ? new Date(data.occurred_at) : new Date(),
      client_event_id: data.client_event_id,
      created_by_user_id: session.user.id,
      created_by_organization_id: session.user.organizationId,
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000 && data.client_event_id) {
      const existing = await OrderTrackingEvent.findOne({
        order_id: order._id,
        client_event_id: data.client_event_id,
      });
      if (existing) {
        return NextResponse.json({ success: true, tracking_event: existing, idempotent_replay: true });
      }
    }
    throw error;
  }

  const eventLabels: Record<string, string> = {
    checkpoint: 'وصلت الشحنة إلى محطة متابعة',
    out_for_delivery: 'خرجت الشحنة للتسليم النهائي',
    delivery_attempt: 'تمت محاولة تسليم الشحنة',
    exception: 'أبلغت شركة الشحن عن عائق',
  };
  await appendOrderSystemEvent({
    order,
    body: `${eventLabels[data.event_type]}: ${data.location}${data.note ? ` — ${data.note}` : ''}`,
    eventType: `tracking_${data.event_type}`,
    actorUserId: session.user.id,
    actorOrganizationId: session.user.organizationId,
    metadata: {
      tracking_event_id: trackingEvent._id.toString(),
      event_type: data.event_type,
      location: data.location,
      note: data.note,
      occurred_at: trackingEvent.occurred_at.toISOString(),
    },
  });
  await Promise.all([order.buyer_organization_id, order.seller_organization_id]
    .filter((organizationId) => organizationId.toString() !== session.user.organizationId)
    .map((organizationId) => createOrganizationNotification(organizationId, {
      type: 'order_picked_up',
      title: `تحديث شحنة ${order.order_number}`,
      body: `${eventLabels[data.event_type]}: ${data.location}`,
      orderId: order._id,
      metadata: { trackingEventId: trackingEvent._id.toString(), eventType: data.event_type },
    })));

  return NextResponse.json(
    { success: true, tracking_event: trackingEvent, idempotent_replay: false },
    { status: 201 }
  );
});
