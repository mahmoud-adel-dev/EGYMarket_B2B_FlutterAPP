import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { connectToDatabase } from '@/lib/db/mongoose';
import Order from '@/models/Order';
import Product from '@/models/Product';
import Organization from '@/models/Organization';
import PlatformSettings from '@/models/PlatformSettings';
import { acceptOrder, commitInventoryOnce } from '@/lib/orders/order_service';
import { reconcileOrphanedReservations } from '@/lib/orders/maintenance';

/*
 * MongoDB integration / chaos tests.
 *
 * These boot a real, in-memory MongoDB running as a REPLICA SET so that
 * `runInTransaction` detects replica-set support and exercises the full
 * multi-document transaction path (snapshot isolation + conditional
 * single-statement updates). They validate the ordering layer's atomic inventory
 * guarantees under concurrency WITHOUT touching any live database.
 *
 * Run via `npm run test:integration` (the fast unit suite excludes this dir).
 */

let mongod: MongoMemoryServer;
let sellerOrg: any;
let buyerOrg: any;

const ACTOR = {
  userId: '',
  role: 'Wholesaler',
  organizationId: '',
};

function makeOrder(item: { productId: any; qty: number; unitPrice: number }, orderNumber: string) {
  const subtotal = item.qty * item.unitPrice;
  return Order.create({
    order_number: orderNumber,
    buyer_organization_id: buyerOrg._id,
    seller_organization_id: sellerOrg._id,
    created_by: sellerOrg._id,
    fulfillment_method: 'buyer_pickup',
    items: [
      {
        product_id: item.productId,
        title: 'Test Widget',
        unit: 'pcs',
        quantity: item.qty,
        unit_price_piasters: item.unitPrice,
        subtotal_piasters: subtotal,
      },
    ],
    goods_subtotal_piasters: subtotal,
    shipping_cost_piasters: 0,
    platform_fee_piasters: 5000,
    total_payable_piasters: subtotal + 5000,
    status: 'requested',
  });
}

async function makeProduct(stock: number) {
  return Product.create({
    title: 'Chaos Test Product',
    description: 'Inventory concurrency test fixture',
    price_piasters: 1000,
    moq: 5,
    images: ['https://example.invalid/x.jpg'],
    category: 'test',
    status: 'active',
    isActive: true,
    stock_quantity: stock,
    reserved_quantity: 0,
    unit: 'pcs',
    organization_id: sellerOrg._id,
    wholesaler_id: sellerOrg._id,
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create({
    instance: { replSet: { count: 1 } },
  });
  // Must be set BEFORE the app's connection singleton is first opened.
  process.env.MONGODB_URI = mongod.getUri('seals_integration');
  (process.env as Record<string, string | undefined>).NODE_ENV = 'test';

  await connectToDatabase();

  sellerOrg = await Organization.create({
    type: 'wholesaler',
    legal_name: 'Seller Co',
    display_name: 'Seller Co',
    slug: 'seller-co-intg',
    phone: '01000000000',
    email: 'seller.intg@seals.demo',
    location: { governorate: 'Cairo' },
    payment_accounts: [
      {
        method: 'instapay',
        label: 'Seller Instapay',
        account_holder: 'Seller Co',
        account_reference: 'seller@instapay',
        is_active: true,
      },
    ],
    is_active: true,
  });

  buyerOrg = await Organization.create({
    type: 'buyer',
    legal_name: 'Buyer Co',
    display_name: 'Buyer Co',
    slug: 'buyer-co-intg',
    phone: '01000000000',
    email: 'buyer.intg@seals.demo',
    location: { governorate: 'Cairo' },
    is_active: true,
  });

  // Platform settings with an active platform collection account, so the
  // `loadBeneficiaryAccounts` step in acceptOrder can build the obligations.
  await PlatformSettings.create({
    key: 'default',
    order_fee_piasters: 5000,
    payment_deadline_hours: 48,
    platform_payment_accounts: [
      {
        method: 'instapay',
        label: 'Platform Instapay',
        account_holder: 'Seals',
        account_reference: 'seals@instapay',
        is_active: true,
      },
    ],
  });

  ACTOR.userId = sellerOrg._id.toString();
  ACTOR.organizationId = sellerOrg._id.toString();
});

afterAll(async () => {
  await mongoose.disconnect().catch(() => {});
  global.mongooseCache = { conn: null, promise: null };
  await mongod?.stop().catch(() => {});
});

describe('atomic inventory reservation (transactions enabled — replica set)', () => {
  it('does not oversell stock when many orders try to reserve the same product concurrently', async () => {
    const STOCK = 10;
    const MOQ = 5;
    const CONCURRENCY = 6;
    const product = await makeProduct(STOCK);

    const orders = [];
    for (let i = 0; i < CONCURRENCY; i += 1) {
      orders.push(await makeOrder({ productId: product._id, qty: MOQ, unitPrice: 1000 }, `CV-${i}`));
    }

    const results = await Promise.allSettled(
      orders.map((order) => acceptOrder(order._id.toString(), ACTOR))
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    // No order may be left half-reserved; every failure must be a clean rejection.
    for (const f of failed) {
      const err = (f as PromiseRejectedResult).reason as { status?: number; code?: string };
      expect(err.status).toBe(409);
      expect(err.code).toBe('INSUFFICIENT_STOCK');
    }
    // Under a stock-starved race at least one reservation must win.
    expect(succeeded.length).toBeGreaterThan(0);

    const finalProduct = await Product.findById(product._id).lean();
    // Core guarantee: reservations never exceed available stock.
    expect(finalProduct.reserved_quantity).toBeLessThanOrEqual(STOCK);
    // Reservations happen in exact MOQ units.
    expect(finalProduct.reserved_quantity % MOQ).toBe(0);
    // Reserved count must correspond exactly to the number of successful accepts.
    expect(finalProduct.reserved_quantity).toBe(succeeded.length * MOQ);

    const acceptedCount = await Order.countDocuments({
      _id: { $in: orders.map((o) => o._id) },
      status: 'awaiting_payments',
    });
    expect(acceptedCount).toBe(succeeded.length);

    // Clean up this trial's rows so later tests start from a clean state.
    await Order.deleteMany({ _id: { $in: orders.map((o) => o._id) } });
    await Product.deleteOne({ _id: product._id });
  });

  it('reconcileOrphanedReservations releases a stale orphan exactly once (idempotent)', async () => {
    const product = await makeProduct(20);
    // Simulate the O-1 crash window: an accept reserved stock, then crashed before
    // the status transition, leaving a `requested` order stuck with the flag set.
    await Product.updateOne({ _id: product._id }, { $set: { reserved_quantity: 5 } });
    const orphan = await Order.create({
      order_number: 'ORPHAN-1',
      buyer_organization_id: buyerOrg._id,
      seller_organization_id: sellerOrg._id,
      created_by: sellerOrg._id,
      fulfillment_method: 'buyer_pickup',
      items: [
        {
          product_id: product._id,
          title: 'Test Widget',
          unit: 'pcs',
          quantity: 5,
          unit_price_piasters: 1000,
          subtotal_piasters: 5000,
        },
      ],
      goods_subtotal_piasters: 5000,
      shipping_cost_piasters: 0,
      platform_fee_piasters: 5000,
      total_payable_piasters: 10000,
      status: 'requested',
      inventory_reserved: true,
      inventory_committed: false,
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    const past = new Date(Date.now() - 60 * 60 * 1000);
    const first = await reconcileOrphanedReservations(past, 30 * 60 * 1000);
    expect(first.released).toBe(1);

    let p = await Product.findById(product._id).lean();
    expect(p.reserved_quantity).toBe(0);
    expect(p.stock_quantity).toBe(20);
    const o1 = await Order.findById(orphan._id).lean();
    expect(o1.inventory_reserved).toBe(false);

    // Second run must not double-release.
    const second = await reconcileOrphanedReservations(past, 30 * 60 * 1000);
    expect(second.released).toBe(0);
    p = await Product.findById(product._id).lean();
    expect(p.reserved_quantity).toBe(0);
    expect(p.stock_quantity).toBe(20);

    await Order.deleteOne({ _id: orphan._id });
    await Product.deleteOne({ _id: product._id });
  });

  it('commitInventoryOnce decrements physical stock exactly once under a double-call race', async () => {
    const product = await makeProduct(10);
    await Product.updateOne({ _id: product._id }, { $set: { reserved_quantity: 5 } });
    const order = await makeOrder({ productId: product._id, qty: 5, unitPrice: 1000 }, 'COMMIT-1');
    await Order.updateOne(
      { _id: order._id },
      { $set: { status: 'awaiting_payments', inventory_reserved: true, inventory_committed: false } }
    );
    const hydrated = (await Order.findById(order._id))!;

    const results = await Promise.allSettled([
      commitInventoryOnce(hydrated),
      commitInventoryOnce(hydrated),
    ]);
    // Both calls must resolve (the second is a no-op, not an error)...
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    const p = await Product.findById(product._id).lean();
    const o = await Order.findById(order._id).lean();
    // ...but stock is decremented exactly once (10 -> 5) and reservation released once.
    expect(p.stock_quantity).toBe(5);
    expect(p.reserved_quantity).toBe(0);
    expect(o.inventory_committed).toBe(true);
    expect(o.inventory_reserved).toBe(false);

    await Order.deleteOne({ _id: order._id });
    await Product.deleteOne({ _id: product._id });
  });
});
