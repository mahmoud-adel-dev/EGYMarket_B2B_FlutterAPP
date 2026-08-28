import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';

import Order from '@/models/Order';
import PaymentObligation from '@/models/PaymentObligation';
import Product from '@/models/Product';
import {
  acceptOrder,
  cancelOrderByBuyer,
  confirmReceipt,
  simpleTransition,
  syncOrderPaymentState,
} from '@/lib/orders/order_service';
import { reconcileOrphanedReservations } from '@/lib/orders/maintenance';
import {
  createProduct,
  createRequestedOrder,
  seedOrderTestContext,
} from './support/order_fixtures';

function expectedConflict(result: PromiseSettledResult<unknown>) {
  if (result.status !== 'rejected') return false;
  const error = result.reason as { status?: number; code?: string };
  return error.status === 409 || error.code === 'INSUFFICIENT_STOCK';
}

async function submitAndConfirmAllPayments(orderId: mongoose.Types.ObjectId) {
  const obligations = await PaymentObligation.find({ order_id: orderId }).sort({ kind: 1 });
  for (const obligation of obligations) {
    const submitted = await PaymentObligation.findOneAndUpdate(
      { _id: obligation._id, status: 'pending' },
      {
        $set: {
          status: 'proof_submitted',
          payment_method: 'instapay',
          sender_reference: `INT-${obligation.kind}-${orderId}`,
          proof_url: 'https://example.test/payment-proof.jpg',
          payer_confirmed_at: new Date(),
        },
      },
      { new: true }
    );
    expect(submitted?.status).toBe('proof_submitted');
    const confirmed = await PaymentObligation.findOneAndUpdate(
      { _id: obligation._id, status: 'proof_submitted' },
      {
        $set: {
          status: 'confirmed',
          beneficiary_confirmed_at: new Date(),
          beneficiary_confirmed_by: new mongoose.Types.ObjectId(),
        },
      },
      { new: true }
    );
    expect(confirmed?.status).toBe('confirmed');
  }
}

describe('MongoDB live order, payment, and inventory lifecycle', () => {
  it('creates one idempotent purchase request document under concurrent duplicate submits', async () => {
    const context = await seedOrderTestContext();
    const product = await createProduct(context, 50);
    const createdBy = new mongoose.Types.ObjectId(context.buyerActor.userId);
    const clientOrderId = 'checkout-double-tap-001';
    const base = {
      buyer_organization_id: context.buyer._id,
      seller_organization_id: context.seller._id,
      created_by: createdBy,
      fulfillment_method: 'buyer_pickup',
      items: [{
        product_id: product._id,
        title: product.title,
        unit: product.unit,
        quantity: 5,
        unit_price_piasters: 1000,
        subtotal_piasters: 5000,
      }],
      goods_subtotal_piasters: 5000,
      shipping_cost_piasters: 0,
      platform_fee_piasters: 5000,
      total_payable_piasters: 10000,
      status: 'requested',
      client_order_id: clientOrderId,
    } as const;

    const attempts = await Promise.allSettled([
      Order.create({ ...base, order_number: 'CREATE-IDEMPOTENT-A' }),
      Order.create({ ...base, order_number: 'CREATE-IDEMPOTENT-B' }),
    ]);

    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await Order.countDocuments({ created_by: createdBy, client_order_id: clientOrderId })).toBe(1);
  });

  it('reserves inventory, issues exact obligations, confirms payments, and commits stock once', async () => {
    const context = await seedOrderTestContext();
    const product = await createProduct(context, 20);
    const requested = await createRequestedOrder(context, product, 5, 'LIFECYCLE-001');

    const accepted = await acceptOrder(requested._id.toString(), context.sellerActor);
    expect(accepted.status).toBe('awaiting_payments');
    expect(accepted.inventory_reserved).toBe(true);
    expect(accepted.payment_due_at).toBeInstanceOf(Date);

    let storedProduct = await Product.findById(product._id).lean();
    expect(storedProduct?.stock_quantity).toBe(20);
    expect(storedProduct?.reserved_quantity).toBe(5);

    const obligations = await PaymentObligation.find({ order_id: requested._id }).sort({ kind: 1 }).lean();
    expect(obligations.map((item) => item.kind).sort()).toEqual(['goods', 'platform_fee']);
    expect(obligations.reduce((sum, item) => sum + item.amount_piasters, 0)).toBe(10000);
    expect(obligations.every((item) => item.status === 'pending')).toBe(true);
    expect(obligations.every((item) => {
      const accounts = (item.payment_account_snapshot as { accounts?: unknown[] })?.accounts;
      return Array.isArray(accounts) && accounts.length > 0;
    })).toBe(true);

    const platformFee = await PaymentObligation.findOneAndUpdate(
      { order_id: requested._id, kind: 'platform_fee', status: 'pending' },
      {
        $set: {
          status: 'confirmed',
          payment_method: 'instapay',
          sender_reference: 'PLATFORM-REF',
          payer_confirmed_at: new Date(),
          beneficiary_confirmed_at: new Date(),
          beneficiary_confirmed_by: new mongoose.Types.ObjectId(),
        },
      },
      { new: true }
    );
    expect(platformFee?.status).toBe('confirmed');
    const stillAwaiting = await syncOrderPaymentState(
      requested._id.toString(),
      context.sellerActor.userId,
      context.sellerActor.role,
      context.sellerActor.organizationId
    );
    expect(stillAwaiting?.status).toBe('awaiting_payments');

    const goods = await PaymentObligation.findOneAndUpdate(
      { order_id: requested._id, kind: 'goods', status: 'pending' },
      {
        $set: {
          status: 'confirmed',
          payment_method: 'instapay',
          sender_reference: 'GOODS-REF',
          payer_confirmed_at: new Date(),
          beneficiary_confirmed_at: new Date(),
          beneficiary_confirmed_by: new mongoose.Types.ObjectId(),
        },
      },
      { new: true }
    );
    expect(goods?.status).toBe('confirmed');
    const preparing = await syncOrderPaymentState(
      requested._id.toString(),
      context.sellerActor.userId,
      context.sellerActor.role,
      context.sellerActor.organizationId
    );
    expect(preparing?.status).toBe('preparing');

    await simpleTransition(
      requested._id.toString(),
      ['preparing'],
      'ready_for_pickup',
      context.sellerActor
    );
    const ready = await Order.findById(requested._id);
    expect(ready).not.toBeNull();

    const confirmations = await Promise.allSettled([
      confirmReceipt(ready!, context.buyerActor),
      confirmReceipt(ready!, context.buyerActor),
    ]);
    expect(confirmations.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(confirmations.filter(expectedConflict)).toHaveLength(1);

    const completed = await Order.findById(requested._id).lean();
    storedProduct = await Product.findById(product._id).lean();
    expect(completed?.status).toBe('completed');
    expect(completed?.inventory_committed).toBe(true);
    expect(completed?.inventory_reserved).toBe(false);
    expect(storedProduct?.stock_quantity).toBe(15);
    expect(storedProduct?.reserved_quantity).toBe(0);
  });

  it('rolls back a partial multi-item reservation when a later item has insufficient stock', async () => {
    const context = await seedOrderTestContext();
    const available = await createProduct(context, 10, { title: 'Available item' });
    const unavailable = await createProduct(context, 2, { title: 'Unavailable item' });
    const order = await createRequestedOrder(context, available, 5, 'ROLLBACK-001');
    order.items.push({
      product_id: unavailable._id,
      title: unavailable.title,
      unit: unavailable.unit,
      quantity: 5,
      unit_price_piasters: 1000,
      subtotal_piasters: 5000,
    });
    order.goods_subtotal_piasters = 10000;
    order.total_payable_piasters = 15000;
    await order.save();

    await expect(acceptOrder(order._id.toString(), context.sellerActor)).rejects.toMatchObject({
      status: 409,
      code: 'INSUFFICIENT_STOCK',
    });

    const [availableAfter, unavailableAfter, orderAfter, obligationCount] = await Promise.all([
      Product.findById(available._id).lean(),
      Product.findById(unavailable._id).lean(),
      Order.findById(order._id).lean(),
      PaymentObligation.countDocuments({ order_id: order._id }),
    ]);
    expect(availableAfter?.reserved_quantity).toBe(0);
    expect(unavailableAfter?.reserved_quantity).toBe(0);
    expect(availableAfter?.stock_quantity).toBe(10);
    expect(unavailableAfter?.stock_quantity).toBe(2);
    expect(orderAfter?.status).toBe('requested');
    expect(orderAfter?.inventory_reserved).toBe(false);
    expect(obligationCount).toBe(0);
  });

  it('rolls back reservation and obligations if payment destinations are not configured', async () => {
    const context = await seedOrderTestContext();
    const product = await createProduct(context, 10);
    const order = await createRequestedOrder(context, product, 4, 'ROLLBACK-PAYMENT-001');
    await context.seller.updateOne({ $set: { payment_accounts: [] } });

    await expect(acceptOrder(order._id.toString(), context.sellerActor)).rejects.toMatchObject({
      status: 409,
      code: 'SELLER_PAYMENT_ACCOUNT_REQUIRED',
    });

    const [productAfter, orderAfter, obligationCount] = await Promise.all([
      Product.findById(product._id).lean(),
      Order.findById(order._id).lean(),
      PaymentObligation.countDocuments({ order_id: order._id }),
    ]);
    expect(productAfter?.reserved_quantity).toBe(0);
    expect(productAfter?.stock_quantity).toBe(10);
    expect(orderAfter?.status).toBe('requested');
    expect(orderAfter?.inventory_reserved).toBe(false);
    expect(obligationCount).toBe(0);
  });

  it('releases a stale orphan reservation exactly once without making inventory negative', async () => {
    const context = await seedOrderTestContext();
    const product = await createProduct(context, 20);
    const order = await createRequestedOrder(context, product, 5, 'ORPHAN-001', {
      inventory_reserved: true,
    });
    await Product.updateOne({ _id: product._id }, { $set: { reserved_quantity: 5 } });
    const staleTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await Order.collection.updateOne(
      { _id: order._id },
      { $set: { updatedAt: staleTime } }
    );

    const first = await reconcileOrphanedReservations(new Date(), 30 * 60 * 1000);
    const second = await reconcileOrphanedReservations(new Date(), 30 * 60 * 1000);
    expect(first.released).toBe(1);
    expect(second.released).toBe(0);

    const [productAfter, orderAfter] = await Promise.all([
      Product.findById(product._id).lean(),
      Order.findById(order._id).lean(),
    ]);
    expect(productAfter?.stock_quantity).toBe(20);
    expect(productAfter?.reserved_quantity).toBe(0);
    expect(orderAfter?.inventory_reserved).toBe(false);
  });
});

describe('purchase concurrency and chaos invariants', () => {
  it('never oversells when many purchase requests reserve the final units concurrently', async () => {
    const context = await seedOrderTestContext();
    const stock = 20;
    const quantity = 5;
    const product = await createProduct(context, stock);
    const orders = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        createRequestedOrder(context, product, quantity, `CONCURRENT-${index}`)
      )
    );

    const results = await Promise.allSettled(
      orders.map((order) => acceptOrder(order._id.toString(), context.sellerActor))
    );
    const succeeded = results.filter((result) => result.status === 'fulfilled');
    const failed = results.filter((result) => result.status === 'rejected');
    expect(succeeded).toHaveLength(stock / quantity);
    expect(failed.every(expectedConflict)).toBe(true);

    const [productAfter, acceptedOrders, obligations] = await Promise.all([
      Product.findById(product._id).lean(),
      Order.find({ _id: { $in: orders.map((order) => order._id) }, status: 'awaiting_payments' }).lean(),
      PaymentObligation.find({ order_id: { $in: orders.map((order) => order._id) } }).lean(),
    ]);
    expect(productAfter?.stock_quantity).toBe(stock);
    expect(productAfter?.reserved_quantity).toBe(stock);
    expect(productAfter!.reserved_quantity).toBeLessThanOrEqual(productAfter!.stock_quantity);
    expect(acceptedOrders).toHaveLength(stock / quantity);
    expect(obligations).toHaveLength((stock / quantity) * 2);
  });

  it('purchase chaos: preserves stock invariants across racing accepts, duplicate cancels, and duplicate receipts', async () => {
    const rounds = Number.parseInt(process.env.PURCHASE_CHAOS_ROUNDS ?? '3', 10);
    const concurrency = Number.parseInt(process.env.PURCHASE_CHAOS_CONCURRENCY ?? '24', 10);
    expect(rounds).toBeGreaterThan(0);
    expect(concurrency).toBeGreaterThan(1);

    for (let round = 0; round < rounds; round += 1) {
      const context = await seedOrderTestContext();
      const quantity = 3;
      const stock = 30;
      const product = await createProduct(context, stock, { title: `Chaos product ${round}` });
      const orders = await Promise.all(
        Array.from({ length: concurrency }, (_, index) =>
          createRequestedOrder(context, product, quantity, `CHAOS-${round}-${index}`)
        )
      );

      const accepts = await Promise.allSettled(
        orders.map(async (order, index) => {
          await new Promise((resolve) => setTimeout(resolve, (index * 7 + round * 3) % 11));
          return acceptOrder(order._id.toString(), context.sellerActor);
        })
      );
      const acceptedIds = accepts.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value._id] : []
      );
      expect(acceptedIds.length).toBe(Math.min(Math.floor(stock / quantity), concurrency));

      const completionIds = acceptedIds.filter((_, index) => index % 2 === 0);
      const cancellationIds = acceptedIds.filter((_, index) => index % 2 === 1);

      for (const orderId of completionIds) {
        await submitAndConfirmAllPayments(orderId);
        const synced = await syncOrderPaymentState(
          orderId.toString(),
          context.sellerActor.userId,
          context.sellerActor.role,
          context.sellerActor.organizationId
        );
        expect(synced?.status).toBe('preparing');
        await simpleTransition(
          orderId.toString(),
          ['preparing'],
          'ready_for_pickup',
          context.sellerActor
        );
      }

      const finalActions: Array<Promise<unknown>> = [];
      for (const orderId of cancellationIds) {
        const order = await Order.findById(orderId);
        finalActions.push(cancelOrderByBuyer(order!, 'Chaos cancellation', context.buyerActor));
        finalActions.push(cancelOrderByBuyer(order!, 'Duplicate chaos cancellation', context.buyerActor));
      }
      for (const orderId of completionIds) {
        const order = await Order.findById(orderId);
        finalActions.push(confirmReceipt(order!, context.buyerActor));
        finalActions.push(confirmReceipt(order!, context.buyerActor));
      }
      await Promise.allSettled(finalActions);

      const [productAfter, finalOrders] = await Promise.all([
        Product.findById(product._id).lean(),
        Order.find({ _id: { $in: acceptedIds } }).lean(),
      ]);
      const completed = finalOrders.filter((order) => order.status === 'completed');
      const canceled = finalOrders.filter((order) => order.status === 'canceled');

      expect(completed).toHaveLength(completionIds.length);
      expect(canceled).toHaveLength(cancellationIds.length);
      expect(finalOrders.every((order) => !order.inventory_reserved)).toBe(true);
      expect(productAfter?.reserved_quantity).toBe(0);
      expect(productAfter?.stock_quantity).toBe(stock - completionIds.length * quantity);
      expect(productAfter!.stock_quantity).toBeGreaterThanOrEqual(0);
      expect(productAfter!.reserved_quantity).toBeGreaterThanOrEqual(0);
    }
  });
});

