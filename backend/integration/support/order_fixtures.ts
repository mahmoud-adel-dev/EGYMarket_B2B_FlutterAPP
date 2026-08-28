import mongoose from 'mongoose';

import Order from '@/models/Order';
import Organization from '@/models/Organization';
import PlatformSettings from '@/models/PlatformSettings';
import Product from '@/models/Product';
import type { ActorContext } from '@/lib/orders/order_service';

export interface OrderTestContext {
  seller: InstanceType<typeof Organization>;
  buyer: InstanceType<typeof Organization>;
  sellerActor: ActorContext;
  buyerActor: ActorContext;
}

export async function seedOrderTestContext(): Promise<OrderTestContext> {
  const suffix = new mongoose.Types.ObjectId().toHexString();
  const [seller, buyer] = await Promise.all([
    Organization.create({
      type: 'wholesaler',
      legal_name: 'Integration Seller',
      display_name: 'Integration Seller',
      slug: `integration-seller-${suffix}`,
      phone: '01000000001',
      email: `seller-${suffix}@example.test`,
      location: { governorate: 'Cairo' },
      verification_status: 'verified',
      payment_accounts: [
        {
          method: 'instapay',
          label: 'Seller Instapay',
          account_holder: 'Integration Seller',
          account_reference: 'seller@instapay',
          is_active: true,
        },
      ],
      is_active: true,
    }),
    Organization.create({
      type: 'buyer',
      legal_name: 'Integration Buyer',
      display_name: 'Integration Buyer',
      slug: `integration-buyer-${suffix}`,
      phone: '01000000002',
      email: `buyer-${suffix}@example.test`,
      location: { governorate: 'Giza' },
      verification_status: 'verified',
      is_active: true,
    }),
  ]);

  await PlatformSettings.create({
    key: 'default',
    order_fee_piasters: 5000,
    payment_deadline_hours: 48,
    platform_payment_accounts: [
      {
        method: 'instapay',
        label: 'Platform Instapay',
        account_holder: 'SEALS',
        account_reference: 'seals@instapay',
        is_active: true,
      },
    ],
  });

  const sellerUserId = new mongoose.Types.ObjectId().toHexString();
  const buyerUserId = new mongoose.Types.ObjectId().toHexString();
  return {
    seller,
    buyer,
    sellerActor: {
      userId: sellerUserId,
      role: 'Wholesaler',
      organizationId: seller._id.toString(),
    },
    buyerActor: {
      userId: buyerUserId,
      role: 'Retailer',
      organizationId: buyer._id.toString(),
    },
  };
}

export async function createProduct(
  context: OrderTestContext,
  stockQuantity: number,
  overrides: Record<string, unknown> = {}
) {
  return Product.create({
    title: 'Integration Product',
    description: 'MongoDB integration test product',
    price_piasters: 1000,
    price_tiers: [],
    moq: 1,
    images: ['https://example.test/product.jpg'],
    category: 'integration-test',
    status: 'active',
    isActive: true,
    stock_quantity: stockQuantity,
    reserved_quantity: 0,
    unit: 'piece',
    organization_id: context.seller._id,
    wholesaler_id: new mongoose.Types.ObjectId(),
    ...overrides,
  });
}

export async function createRequestedOrder(
  context: OrderTestContext,
  product: InstanceType<typeof Product>,
  quantity: number,
  orderNumber: string,
  overrides: Record<string, unknown> = {}
) {
  const unitPrice = product.price_piasters;
  const subtotal = unitPrice * quantity;
  return Order.create({
    order_number: orderNumber,
    buyer_organization_id: context.buyer._id,
    seller_organization_id: context.seller._id,
    created_by: new mongoose.Types.ObjectId(context.buyerActor.userId),
    fulfillment_method: 'buyer_pickup',
    items: [
      {
        product_id: product._id,
        title: product.title,
        unit: product.unit,
        quantity,
        unit_price_piasters: unitPrice,
        subtotal_piasters: subtotal,
      },
    ],
    goods_subtotal_piasters: subtotal,
    shipping_cost_piasters: 0,
    platform_fee_piasters: 5000,
    total_payable_piasters: subtotal + 5000,
    status: 'requested',
    status_history: [
      {
        status: 'requested',
        changed_by: new mongoose.Types.ObjectId(context.buyerActor.userId),
        changed_by_role: 'Retailer',
        changed_by_organization_id: context.buyer._id,
        timestamp: new Date(),
      },
    ],
    ...overrides,
  });
}

