import mongoose from 'mongoose';
import type { ClientSession } from 'mongodb';
import Order, {
  IOrder,
  IOrderItem,
  IOrderStatusHistory,
  OrderStatus,
} from '@/models/Order';
import Product from '@/models/Product';
import Organization from '@/models/Organization';
import PaymentObligation from '@/models/PaymentObligation';
import Dispute from '@/models/Dispute';
import { getPlatformSettings } from '@/models/PlatformSettings';
import { ApiError } from '@/lib/errors/api_error';
import { runInTransaction } from '@/lib/db/transaction';

export { unitPriceForQuantity } from '@/lib/orders/pricing';

export interface ActorContext {
  userId: string;
  role: string;
  organizationId?: string;
}

/**
 * Build an immutable status-history entry. Kept central so every transition records
 * identical shape regardless of which code path performed it.
 */
function historyEntry(
  status: OrderStatus,
  previous: OrderStatus,
  actor: ActorContext,
  note?: string,
  timestamp = new Date()
): IOrderStatusHistory {
  return {
    status,
    previous_status: previous,
    changed_by: new mongoose.Types.ObjectId(actor.userId),
    changed_by_role: actor.role,
    changed_by_organization_id: actor.organizationId
      ? new mongoose.Types.ObjectId(actor.organizationId)
      : undefined,
    timestamp,
    note,
  };
}

/**
 * Conditional single-statement status transition. This is the canonical race gate for
 * every order mutation: exactly one concurrent caller can move an order out of a given
 * state, so downstream one-shot effects (inventory, obligations) execute exactly once.
 * Returns the updated order or null when another actor won the race.
 */
async function transitionOrder(
  orderId: mongoose.Types.ObjectId,
  fromStatuses: OrderStatus[],
  toStatus: OrderStatus,
  actor: ActorContext,
  extraSet: Record<string, unknown> = {},
  note?: string,
  session?: ClientSession
): Promise<IOrder | null> {
  const previous = fromStatuses[0];
  const updated = await Order.findOneAndUpdate(
    { _id: orderId, status: { $in: fromStatuses } },
    {
      $set: { status: toStatus, ...extraSet },
      $push: { status_history: historyEntry(toStatus, previous as OrderStatus, actor, note) },
    },
    { new: true, session }
  );
  return updated;
}

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

/**
 * Atomically reserve stock for every item. Each item uses a conditional `$inc`
 * guarded by available stock (`stock - reserved >= qty`) so overselling is impossible;
 * partial success is compensated before throwing.
 */
async function reserveItems(items: IOrderItem[], session?: ClientSession) {
  const reserved: IOrderItem[] = [];
  try {
    for (const item of items) {
      const product = await Product.findOneAndUpdate(
        {
          _id: item.product_id,
          status: 'active',
          isActive: true,
          $expr: { $gte: [{ $subtract: ['$stock_quantity', '$reserved_quantity'] }, item.quantity] },
        },
        { $inc: { reserved_quantity: item.quantity } },
        { new: true, session }
      );
      if (!product) throw new ApiError(409, `Insufficient stock for ${item.title}`, 'INSUFFICIENT_STOCK');
      reserved.push(item);
    }
  } catch (error) {
    if (reserved.length) {
      await Product.bulkWrite(
        reserved.map((item) => ({
          updateOne: { filter: { _id: item.product_id }, update: { $inc: { reserved_quantity: -item.quantity } } },
        })),
        { session }
      );
    }
    throw error;
  }
}

/**
 * Flip `inventory_reserved` true→false exactly once. The boolean claim is the
 * concurrency gate; stock effects are applied only by the claim winner.
 */
async function claimReservationRelease(
  orderId: mongoose.Types.ObjectId,
  session?: ClientSession
): Promise<boolean> {
  const res = await Order.updateOne(
    { _id: orderId, inventory_reserved: true, inventory_committed: false },
    { $set: { inventory_reserved: false } },
    { session }
  );
  return res.modifiedCount === 1;
}

/** Release reserved stock if (and only if) this call wins the release claim. */
export async function releaseReservedStockOnce(order: IOrder, session?: ClientSession) {
  const won = await claimReservationRelease(order._id, session);
  if (!won || !order.items.length) return;
  await Product.bulkWrite(
    order.items.map((item) => ({
      updateOne: {
        filter: { _id: item.product_id },
        update: { $inc: { reserved_quantity: -item.quantity } },
      },
    })),
    { session }
  );
}

/**
 * Commit inventory (convert reservation into a definitive sale) exactly once.
 * The `inventory_committed` flag flip is the single-winner gate, which prevents the
 * double-decrement corruption possible when two confirmations race.
 */
export async function commitInventoryOnce(order: IOrder, session?: ClientSession) {
  const claimedOrder = await Order.findOneAndUpdate(
    { _id: order._id, inventory_committed: false },
    { $set: { inventory_committed: true, inventory_reserved: false } },
    // The pre-update document tells us whether a live reservation still exists.
    { new: false, session }
  );
  if (!claimedOrder) return;
  const hadReservation = claimedOrder.inventory_reserved;
  for (const item of order.items) {
    const product = await Product.findByIdAndUpdate(
      item.product_id,
      {
        $inc: {
          stock_quantity: -item.quantity,
          ...(hadReservation ? { reserved_quantity: -item.quantity } : {}),
        },
      },
      { new: true, session }
    );
    if (product && product.stock_quantity <= 0) {
      // Depleted products are hidden from discovery rather than left purchasable.
      product.stock_quantity = 0;
      product.status = 'out_of_stock';
      product.isActive = false;
      await product.save({ session });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Payment obligations                                                 */
/* ------------------------------------------------------------------ */

function activeAccounts(organization: { payment_accounts?: Array<Record<string, unknown>> } | null) {
  return (organization?.payment_accounts || [])
    .filter((account) => account.is_active)
    .map((account) => ({
      method: account.method,
      label: account.label,
      account_holder: account.account_holder,
      account_reference: account.account_reference,
      instructions: account.instructions,
    }));
}

/** Load the payment accounts each beneficiary expects buyers to pay into. */
async function loadBeneficiaryAccounts(order: IOrder) {
  const [seller, shipper, settings] = await Promise.all([
    Organization.findById(order.seller_organization_id).lean(),
    order.shipper_organization_id ? Organization.findById(order.shipper_organization_id).lean() : null,
    getPlatformSettings(),
  ]);
  const sellerAccounts = activeAccounts(seller);
  const platformAccounts = (settings.platform_payment_accounts || []).filter((a) => a.is_active);
  const shipperAccounts = activeAccounts(shipper);

  // A buyer must always be told where to send money; missing destinations are a hard error.
  if (!sellerAccounts.length) throw new ApiError(409, 'Seller must configure a local payment account before accepting orders', 'SELLER_PAYMENT_ACCOUNT_REQUIRED');
  if (!platformAccounts.length) throw new ApiError(409, 'Platform payment account is not configured', 'PLATFORM_PAYMENT_ACCOUNT_REQUIRED');
  if (order.fulfillment_method === 'third_party_shipping' && !shipperAccounts.length) {
    throw new ApiError(409, 'Shipping company must configure a local payment account', 'SHIPPER_PAYMENT_ACCOUNT_REQUIRED');
  }

  const docs: Array<Record<string, unknown>> = [
    {
      order_id: order._id,
      kind: 'platform_fee',
      payer_organization_id: order.buyer_organization_id,
      beneficiary_type: 'platform',
      amount_piasters: order.platform_fee_piasters,
      payment_account_snapshot: { accounts: platformAccounts },
    },
    {
      order_id: order._id,
      kind: 'goods',
      payer_organization_id: order.buyer_organization_id,
      beneficiary_type: 'organization',
      beneficiary_organization_id: order.seller_organization_id,
      amount_piasters: order.goods_subtotal_piasters,
      payment_account_snapshot: { accounts: sellerAccounts },
    },
  ];
  if (order.fulfillment_method === 'third_party_shipping' && order.shipper_organization_id) {
    docs.push({
      order_id: order._id,
      kind: 'shipping',
      payer_organization_id: order.buyer_organization_id,
      beneficiary_type: 'organization',
      beneficiary_organization_id: order.shipper_organization_id,
      amount_piasters: order.shipping_cost_piasters,
      payment_account_snapshot: { accounts: shipperAccounts },
    });
  }
  return { docs, settings };
}

/**
 * Create the order's payment obligations exactly once. The `{order_id, kind}` unique
 * index makes insertion idempotent: a retry that collides verifies the existing set
 * matches what would have been written and treats it as success.
 */
async function insertObligationsIdempotent(order: IOrder, session?: ClientSession) {
  const { docs, settings } = await loadBeneficiaryAccounts(order);
  try {
    await PaymentObligation.insertMany(docs, { ordered: true, session });
  } catch (error) {
    const isDuplicate = (error as { code?: number })?.code === 11000;
    if (!isDuplicate) throw error;
    const existing = await PaymentObligation.find({ order_id: order._id }).session(session ?? null).lean();
    const existingKinds = existing.map((e) => e.kind).sort().join(',');
    const expectedKinds = docs.map((d) => d.kind).sort().join(',');
    if (existingKinds !== expectedKinds || existing.some((e) => e.status === 'rejected')) {
      throw new ApiError(409, 'Payment obligations already exist for this order', 'OBLIGATIONS_EXIST');
    }
  }
  return settings;
}

/* ------------------------------------------------------------------ */
/* Order lifecycle actions                                             */
/* ------------------------------------------------------------------ */

/**
 * Seller accepts an order: verify stock, reserve it, create payment obligations,
 * set the payment deadline, and transition to `awaiting_payments`. All steps run in
 * one MongoDB transaction when the topology supports it; the standalone fallback
 * remains safe because every step is individually atomic and compensated.
 */
export async function acceptOrder(orderId: string, actor: ActorContext): Promise<IOrder> {
  return runInTransaction(async (session) => {
    let order = await Order.findById(orderId).session(session ?? null);
    if (!order) throw new ApiError(404, 'Order not found', 'NOT_FOUND');

    if (order.status === 'awaiting_payments') {
      // Auto-heal path: a prior attempt may have crashed between transition and
      // obligation creation. Idempotently finish the remaining work.
      const hasObligations = await PaymentObligation.exists({ order_id: order._id }).session(session ?? null);
      if (hasObligations) {
        throw new ApiError(409, 'This action is not allowed for the current order state and participant');
      }
      const settings = await insertObligationsIdempotent(order, session);
      if (!order.payment_due_at) {
        order = (await Order.findByIdAndUpdate(
          order._id,
          { $set: { payment_due_at: new Date(Date.now() + settings.payment_deadline_hours * 60 * 60 * 1000) } },
          { new: true, session }
        ))!;
      }
      return order;
    }
    if (order.status !== 'requested') {
      throw new ApiError(409, 'This action is not allowed for the current order state and participant');
    }

    await reserveItems(order.items, session);

    let settings;
    try {
      settings = await insertObligationsIdempotent(order, session);
    } catch (error) {
      await reserveCompensation(order.items, session);
      throw error;
    }

    const dueAt = new Date(Date.now() + settings.payment_deadline_hours * 60 * 60 * 1000);
    const updated = await transitionOrder(
      order._id,
      ['requested'],
      'awaiting_payments',
      actor,
      {
        inventory_reserved: true,
        payment_due_at: dueAt,
      },
      'Order accepted; payment obligations issued',
      session
    );
    if (!updated) {
      // Lost an accept race in a non-transactional deployment — undo our reservation.
      await reserveCompensation(order.items, session);
      throw new ApiError(409, 'Order was already processed by another user', 'ORDER_CONFLICT');
    }
    return updated;
  });
}

/** Undo a successful full reservation (all items were reserved). */
async function reserveCompensation(items: IOrderItem[], session?: ClientSession) {
  if (!items.length) return;
  await Product.bulkWrite(
    items.map((item) => ({
      updateOne: { filter: { _id: item.product_id }, update: { $inc: { reserved_quantity: -item.quantity } } },
    })),
    { session }
  );
}

/** Simple guarded transition used by reject / mark_ready / pickup / delivery. */
export async function simpleTransition(
  orderId: string,
  fromStatuses: OrderStatus[],
  toStatus: OrderStatus,
  actor: ActorContext,
  extraSet: Record<string, unknown> = {},
  note?: string,
  session?: ClientSession
): Promise<IOrder> {
  const updated = await transitionOrder(new mongoose.Types.ObjectId(orderId), fromStatuses, toStatus, actor, extraSet, note, session);
  if (!updated) throw new ApiError(409, 'This action is not allowed for the current order state and participant');
  return updated;
}

/**
 * Buyer cancels before any payment proof: transition first (race gate), then release
 * any reservation exactly once.
 */
export async function cancelOrderByBuyer(order: IOrder, reason: string, actor: ActorContext): Promise<IOrder> {
  return runInTransaction(async (session) => {
    const paidOrSubmitted = await PaymentObligation.exists({
      order_id: order._id,
      status: { $nin: ['pending', 'rejected'] },
    }).session(session ?? null);
    if (paidOrSubmitted) {
      throw new ApiError(409, 'A payment was submitted; open a dispute for manual refund review');
    }
    const updated = await transitionOrder(
      order._id,
      [order.status],
      'canceled',
      actor,
      { cancellation_reason: reason },
      reason,
      session
    );
    if (!updated) throw new ApiError(409, 'This action is not allowed for the current order state and participant');
    if (updated.inventory_reserved && !updated.inventory_committed) {
      await releaseReservedStockOnce(updated, session);
    }
    // Remove now-meaningless pending obligations so the buyer's money tab stays clean.
    await PaymentObligation.deleteMany({ order_id: order._id, status: { $in: ['pending', 'rejected'] } }).session(session ?? null);
    return updated;
  });
}

/** Buyer confirms receipt: transition is the gate; inventory commits exactly once. */
export async function confirmReceipt(order: IOrder, actor: ActorContext): Promise<IOrder> {
  return runInTransaction(async (session) => {
    const from: OrderStatus[] =
      order.fulfillment_method === 'buyer_pickup' ? ['ready_for_pickup'] : ['delivered'];
    const updated = await transitionOrder(order._id, from, 'completed', actor, {}, 'Buyer confirmed receipt', session);
    if (!updated) throw new ApiError(409, 'This action is not allowed for the current order state and participant');
    await commitInventoryOnce(updated, session);
    return updated;
  });
}

/* ------------------------------------------------------------------ */
/* Disputes                                                            */
/* ------------------------------------------------------------------ */

/** Statuses from which parties may open a dispute (nothing happened yet on `requested`). */
const DISPUTE_ELIGIBLE_STATUSES: OrderStatus[] = [
  'awaiting_payments',
  'preparing',
  'ready_for_pickup',
  'in_transit',
  'delivered',
  'completed',
];

/**
 * Open a dispute through the state machine. Used by BOTH the dedicated disputes route
 * and the generic status route so there is exactly one dispute implementation.
 */
export async function openOrderDispute(
  order: IOrder,
  data: { reason: string; evidence_urls: string[] },
  actor: ActorContext
): Promise<{ dispute: mongoose.Document; order: IOrder }> {
  return runInTransaction(async (session) => {
    const activeDispute = await Dispute.findOne({ order_id: order._id, status: { $in: ['open', 'in_review'] } }).session(session ?? null);
    if (activeDispute) throw new ApiError(409, 'An active dispute already exists');

    const fresh = (await Order.findById(order._id).session(session ?? null))!;
    if (!DISPUTE_ELIGIBLE_STATUSES.includes(fresh.status)) {
      throw new ApiError(409, 'This action is not allowed for the current order state and participant');
    }

    const dispute = await Dispute.create(
      [{
        order_id: fresh._id,
        opened_by_user_id: actor.userId,
        opened_by_organization_id: actor.organizationId,
        reason: data.reason,
        evidence_urls: data.evidence_urls,
      }],
      { session }
    ).then((docs) => docs[0]);

    // Freeze submitted/confirmed money movements for review…
    await PaymentObligation.updateMany(
      { order_id: fresh._id, status: { $in: ['proof_submitted', 'confirmed'] } },
      { $set: { status: 'disputed' } },
      { session }
    );

    // …and win the transition to `disputed`. Losing means someone else finalized the
    // order concurrently; undo the just-created dispute instead of stranding it.
    const updated = await transitionOrder(fresh._id, [fresh.status], 'disputed', actor, {}, data.reason, session);
    if (!updated) {
      await Dispute.deleteOne({ _id: dispute._id }).session(session ?? null);
      throw new ApiError(409, 'Order was already processed by another user', 'ORDER_CONFLICT');
    }

    // Once custody has started, inventory represents goods already moving to the
    // buyer and must remain reserved while the dispute is reviewed.
    if (
      ['awaiting_payments', 'preparing'].includes(fresh.status) &&
      updated.inventory_reserved &&
      !updated.inventory_committed
    ) {
      await releaseReservedStockOnce(updated, session);
    }
    return { dispute, order: updated };
  });
}

/**
 * Admin resolves a dispute by upholding the transaction: order completes, inventory
 * commits, frozen obligations are restored to `confirmed`.
 */
export async function resolveDisputeAsCompleted(disputeId: string, resolution: string, admin: ActorContext) {
  return runInTransaction(async (session) => {
    const dispute = await Dispute.findOneAndUpdate(
      { _id: disputeId, status: { $in: ['open', 'in_review'] } },
      { $set: { status: 'resolved', resolution, resolved_by: admin.userId, resolved_at: new Date() } },
      { new: true, session }
    );
    if (!dispute) throw new ApiError(404, 'Open dispute not found', 'NOT_FOUND');

    const order = (await Order.findById(dispute.order_id).session(session ?? null))!;
    if (order.status !== 'disputed') throw new ApiError(409, 'Order is not in disputed state');

    // An early dispute may have released its reservation. Re-acquire it before an
    // admin upholds the sale; otherwise completion could oversell current stock.
    let newlyReserved = false;
    if (!order.inventory_reserved && !order.inventory_committed) {
      await reserveItems(order.items, session);
      const reservationClaim = await Order.updateOne(
        { _id: order._id, status: 'disputed', inventory_reserved: false, inventory_committed: false },
        { $set: { inventory_reserved: true } },
        { session }
      );
      if (reservationClaim.modifiedCount !== 1) {
        await reserveCompensation(order.items, session);
        throw new ApiError(409, 'Order was already processed by another user', 'ORDER_CONFLICT');
      }
      newlyReserved = true;
      order.inventory_reserved = true;
    }

    const updated = await transitionOrder(order._id, ['disputed'], 'completed', admin, {}, `Dispute resolved: ${resolution}`, session);
    if (!updated) {
      if (newlyReserved) {
        await Order.updateOne(
          { _id: order._id, status: 'disputed', inventory_committed: false },
          { $set: { inventory_reserved: false } },
          { session }
        );
        await reserveCompensation(order.items, session);
      }
      throw new ApiError(409, 'Order was already processed by another user', 'ORDER_CONFLICT');
    }

    await PaymentObligation.updateMany(
      { order_id: order._id, status: { $in: ['disputed', 'proof_submitted'] } },
      { $set: { status: 'confirmed', beneficiary_confirmed_at: new Date(), beneficiary_confirmed_by: new mongoose.Types.ObjectId(admin.userId) } },
      { session }
    );
    await commitInventoryOnce(updated, session);
    return { dispute, order: updated };
  });
}

/**
 * Admin resolves a dispute by unwinding it: order cancels, reserved stock returns,
 * submitted/confirmed/disputed obligations become `refund_pending` for operators.
 */
export async function resolveDisputeAsCanceled(disputeId: string, resolution: string, admin: ActorContext) {
  return runInTransaction(async (session) => {
    const dispute = await Dispute.findOneAndUpdate(
      { _id: disputeId, status: { $in: ['open', 'in_review'] } },
      { $set: { status: 'resolved', resolution, resolved_by: admin.userId, resolved_at: new Date() } },
      { new: true, session }
    );
    if (!dispute) throw new ApiError(404, 'Open dispute not found', 'NOT_FOUND');

    const order = (await Order.findById(dispute.order_id).session(session ?? null))!;
    if (order.status !== 'disputed') throw new ApiError(409, 'Order is not in disputed state');

    const updated = await transitionOrder(
      order._id,
      ['disputed'],
      'canceled',
      admin,
      { cancellation_reason: `Dispute resolved: ${resolution}` },
      `Dispute resolved: ${resolution}`,
      session
    );
    if (!updated) throw new ApiError(409, 'Order was already processed by another user', 'ORDER_CONFLICT');

    await PaymentObligation.updateMany(
      { order_id: order._id, status: { $in: ['disputed', 'proof_submitted', 'confirmed'] } },
      { $set: { status: 'refund_pending' } },
      { session }
    );
    if (updated.inventory_reserved && !updated.inventory_committed) {
      await releaseReservedStockOnce(updated, session);
    }
    return { dispute, order: updated };
  });
}

/* ------------------------------------------------------------------ */
/* Payment-state sync                                                  */
/* ------------------------------------------------------------------ */

/**
 * When every obligation is confirmed the order leaves `awaiting_payments` for
 * `preparing`. Uses a conditional transition so double-invocation is harmless.
 */
export async function syncOrderPaymentState(
  orderId: string,
  changedBy: string,
  role: string,
  organizationId?: string
) {
  return runInTransaction(async (session) => {
    const [order, obligations] = await Promise.all([
      Order.findById(orderId).session(session ?? null),
      PaymentObligation.find({ order_id: orderId }).session(session ?? null),
    ]);
    if (!order || !obligations.length || obligations.some((item) => item.status !== 'confirmed')) return order;
    if (order.status !== 'awaiting_payments') return order;

    const updated = await transitionOrder(
      order._id,
      ['awaiting_payments'],
      'preparing',
      { userId: changedBy, role, organizationId },
      {},
      'All payment obligations confirmed',
      session
    );
    return updated ?? order;
  });
}
