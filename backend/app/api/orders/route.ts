import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { withAuth } from '@/lib/auth/withAuth';
import { parsePagination } from '@/lib/api/pagination';
import { CreateOrderSchema } from '@/lib/validation/order';
import { ApiError } from '@/lib/errors/api_error';
import { hasTradingEntitlement } from '@/lib/subscriptions/entitlements';
import { unitPriceForQuantity } from '@/lib/orders/order_service';
import { getPlatformSettings } from '@/models/PlatformSettings';
import Cart from '@/models/Cart';
import Order, { IOrderItem } from '@/models/Order';
import Organization from '@/models/Organization';
import Product from '@/models/Product';
import ShippingRate from '@/models/ShippingRate';
import PaymentObligation from '@/models/PaymentObligation';
import { createOrganizationNotification } from '@/lib/notifications/notification_service';
import { appendOrderSystemEvent } from '@/lib/orders/order_chat';

export const POST = withAuth(['Retailer'], async (req: NextRequest, context, session) => {
  if (!session.user.organizationId) throw new ApiError(400, 'Buyer organization is required');
  const data = CreateOrderSchema.parse(await req.json());

  const duplicateIds = new Set<string>();
  for (const item of data.items) {
    if (duplicateIds.has(item.product_id)) throw new ApiError(400, 'Each product may appear only once');
    duplicateIds.add(item.product_id);
  }

  const [buyer, buyerEntitled, products, settings] = await Promise.all([
    Organization.findById(session.user.organizationId),
    hasTradingEntitlement(session.user.organizationId),
    Product.find({ _id: { $in: data.items.map((item) => item.product_id) }, status: 'active', isActive: true }),
    getPlatformSettings(),
  ]);
  if (!buyer || !buyer.is_active) throw new ApiError(403, 'Buyer organization is not active');
  if (!buyerEntitled) throw new ApiError(402, 'An active subscription is required', 'SUBSCRIPTION_REQUIRED');
  if (products.length !== data.items.length) throw new ApiError(400, 'One or more products are unavailable');

  const productMap = new Map(products.map((product) => [product._id.toString(), product]));
  let sellerOrganizationId: string | undefined;
  let subtotal = 0;
  const orderItems: IOrderItem[] = [];
  for (const requested of data.items) {
    const product = productMap.get(requested.product_id)!;
    const currentSellerId = product.organization_id?.toString();
    if (!currentSellerId) throw new ApiError(409, 'Product is not linked to an organization');
    if (!sellerOrganizationId) sellerOrganizationId = currentSellerId;
    if (sellerOrganizationId !== currentSellerId) {
      throw new ApiError(400, 'Create a separate order for each wholesaler');
    }
    if (sellerOrganizationId === session.user.organizationId) throw new ApiError(400, 'An organization cannot buy its own product');
    if (requested.quantity < product.moq) throw new ApiError(400, `Minimum quantity for ${product.title} is ${product.moq}`);
    if (requested.quantity > product.stock_quantity - product.reserved_quantity) {
      throw new ApiError(409, `Requested stock is unavailable for ${product.title}`, 'INSUFFICIENT_STOCK');
    }
    const unitPrice = unitPriceForQuantity(product, requested.quantity);
    const lineSubtotal = unitPrice * requested.quantity;
    subtotal += lineSubtotal;
    orderItems.push({
      product_id: product._id,
      sku: product.sku,
      title: product.title,
      unit: product.unit,
      quantity: requested.quantity,
      unit_price_piasters: unitPrice,
      subtotal_piasters: lineSubtotal,
    });
  }

  const [seller, sellerEntitled] = await Promise.all([
    Organization.findById(sellerOrganizationId),
    hasTradingEntitlement(sellerOrganizationId!),
  ]);
  if (!seller || seller.type !== 'wholesaler' || seller.verification_status !== 'verified' || !seller.is_active) {
    throw new ApiError(409, 'Seller is not verified or active');
  }
  if (!sellerEntitled) throw new ApiError(409, 'Seller subscription is not active');

  let shippingRate = null;
  if (data.fulfillment_method === 'third_party_shipping') {
    shippingRate = await ShippingRate.findOne({
      _id: data.shipping_rate_id,
      is_active: true,
      from_governorate: seller.location.governorate,
      to_governorate: data.shipping_address!.governorate,
    });
    if (!shippingRate) throw new ApiError(400, 'Selected shipping rate does not cover this route');
    const shipper = await Organization.findOne({
      _id: shippingRate.shipper_organization_id,
      type: 'shipper',
      verification_status: 'verified',
      is_active: true,
    });
    if (!shipper || !(await hasTradingEntitlement(shipper._id.toString()))) {
      throw new ApiError(409, 'Selected shipping company is unavailable');
    }
  }

  const shippingCost = shippingRate?.price_piasters || 0;
  const order = await Order.create({
    order_number: `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
    buyer_organization_id: buyer._id,
    seller_organization_id: seller._id,
    shipper_organization_id: shippingRate?.shipper_organization_id,
    created_by: session.user.id,
    fulfillment_method: data.fulfillment_method,
    shipping_rate_id: shippingRate?._id,
    shipping_address: data.shipping_address,
    items: orderItems,
    goods_subtotal_piasters: subtotal,
    shipping_cost_piasters: shippingCost,
    platform_fee_piasters: settings.order_fee_piasters,
    total_payable_piasters: subtotal + shippingCost + settings.order_fee_piasters,
    status: 'requested',
    status_history: [{
      status: 'requested',
      changed_by: new mongoose.Types.ObjectId(session.user.id),
      changed_by_role: session.user.role,
      changed_by_organization_id: buyer._id,
      timestamp: new Date(),
      note: 'Wholesale purchase request created',
    }],
  });

  await Cart.updateOne(
    { buyer_organization_id: buyer._id },
    { $pull: { items: { product_id: { $in: data.items.map((item) => new mongoose.Types.ObjectId(item.product_id)) } } } }
  );
  createOrganizationNotification(seller._id, {
    type: 'order_created',
    title: 'طلب جملة جديد',
    body: `وصل طلب شراء جديد رقم ${order.order_number}`,
    orderId: order._id,
  }).catch(() => {});
  await appendOrderSystemEvent({
    order,
    body: 'أنشأ المشتري طلب شراء جملة جديدًا وأرسله إلى البائع للمراجعة',
    eventType: 'order_created',
    actorUserId: session.user.id,
    actorOrganizationId: session.user.organizationId,
    metadata: { status: order.status, order_number: order.order_number },
  });

  return NextResponse.json({ success: true, message: 'Purchase request created', order }, { status: 201 });
});

export const GET = withAuth([], async (req: NextRequest, context, session) => {
  const params = new URL(req.url).searchParams;
  const { page, limit, skip } = parsePagination(params);
  const filter: Record<string, unknown> = {};
  if (session.user.role !== 'Admin') {
    filter.$or = [
      { buyer_organization_id: session.user.organizationId },
      { seller_organization_id: session.user.organizationId },
      { shipper_organization_id: session.user.organizationId },
    ];
  }
  const status = params.get('status');
  if (status) filter.status = status;
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('buyer_organization_id', 'display_name avatar_url location')
      .populate('seller_organization_id', 'display_name avatar_url location')
      .populate('shipper_organization_id', 'display_name avatar_url phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);
  const obligationRows = orders.length
    ? await PaymentObligation.find({ order_id: { $in: orders.map((order) => order._id) } })
        .select('order_id kind status amount_piasters')
        .lean()
    : [];
  const obligationsByOrder = new Map<string, typeof obligationRows>();
  for (const obligation of obligationRows) {
    const key = obligation.order_id.toString();
    obligationsByOrder.set(key, [...(obligationsByOrder.get(key) || []), obligation]);
  }
  const rows = orders.map((order) => {
    const obligations = obligationsByOrder.get(order._id.toString()) || [];
    const confirmedCount = obligations.filter((item) => item.status === 'confirmed').length;
    const allConfirmed = obligations.length > 0 && confirmedCount === obligations.length;
    const paymentState = obligations.length === 0
      ? 'not_issued'
      : allConfirmed
        ? 'paid'
        : confirmedCount > 0 || obligations.some((item) => item.status === 'proof_submitted')
          ? 'partial'
          : 'pending';
    const buyerId = (order.buyer_organization_id as any)?._id?.toString() || order.buyer_organization_id?.toString();
    const isCurrentBuyer = buyerId === session.user.organizationId;
    const platformFee = obligations.find((item) => item.kind === 'platform_fee');
    const chatAllowed = session.user.role === 'Admin' || !isCurrentBuyer ||
      Boolean(order.buyer_chat_unlocked_at) || platformFee?.status === 'confirmed';
    return {
      ...order,
      payment_summary: {
        state: paymentState,
        confirmed_count: confirmedCount,
        total_count: obligations.length,
      },
      chat_access: {
        allowed: chatAllowed,
        reason_code: chatAllowed ? undefined : 'PLATFORM_FEE_REQUIRED',
        platform_fee_status: platformFee?.status || 'not_issued',
        platform_fee_amount_piasters: platformFee?.amount_piasters || order.platform_fee_piasters,
      },
    };
  });
  return NextResponse.json({ success: true, orders: rows, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } });
});
