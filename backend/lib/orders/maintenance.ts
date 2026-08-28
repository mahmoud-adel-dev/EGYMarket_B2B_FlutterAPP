import Order from '@/models/Order';
import PaymentObligation from '@/models/PaymentObligation';
import { releaseReservedStockOnce } from '@/lib/orders/order_service';
import Product from '@/models/Product';
import { createOrganizationNotification } from '@/lib/notifications/notification_service';
import { appendOrderSystemEvent } from '@/lib/orders/order_chat';

/**
 * O-1: Release orphaned inventory / reservations left behind by a crash in the
 * standalone (non-replica-set) fallback of `acceptOrder`. On such deployments a
 * crash between reserving stock and the status transition leaves the order in
 * `requested` with `inventory_reserved: true` but never reaches `awaiting_payments`.
 *
 * Normally a `requested` order holds no reservation (the flag is only set at
 * accept). Reaching `awaiting_payments` is required for a legitimate reservation,
 * so any `requested` order still flagged as reserved past a settlement horizon is
 * genuinely orphaned and safe to release. `releaseReservedStockOnce` is gated by
 * the single-winner flag claim, so this is idempotent across concurrent runs.
 */
export async function reconcileOrphanedReservations(now = new Date(), staleMs = 30 * 60 * 1000) {
  const cutoff = new Date(now.getTime() - staleMs);
  const orphans = await Order.find({
    status: 'requested',
    inventory_reserved: true,
    inventory_committed: false,
    updatedAt: { $lte: cutoff },
  }).lean();

  let released = 0;
  for (const order of orphans) {
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, status: 'requested', inventory_reserved: true, inventory_committed: false },
      { $set: { inventory_reserved: false } },
      { new: true }
    );
    if (!updated) continue; // concurrent winner already handled it
    await releaseReservedStockOnce(updated);
    await appendOrderSystemEvent({
      order: updated,
      body: 'تم تحرير مخزون محجوز لطلب عالق في حالة طلب (تعطل غير متوقع)',
      eventType: 'system',
      metadata: { status: 'requested', note: 'orphaned reservation reconciled' },
    });
    released += 1;
  }
  return { scanned: orphans.length, released };
}

/**
 * Cancel orders whose payment deadline expired without any submitted proof.
 * The conditional status update is the single-winner gate so concurrent cron
 * invocations cannot double-release inventory; stock release itself is additionally
 * guarded by the `inventory_reserved` flag claim in `releaseReservedStockOnce`.
 */
export async function cancelUnpaidExpiredOrders(now = new Date()) {
  const orders = await Order.find({ status: 'awaiting_payments', payment_due_at: { $lte: now } }).lean();
  let canceled = 0;
  let movedToReview = 0;

  for (const order of orders) {
    const paymentInProgress = await PaymentObligation.exists({
      order_id: order._id,
      status: { $in: ['proof_submitted', 'confirmed', 'disputed', 'refund_pending', 'refunded'] },
    });
    if (paymentInProgress) {
      const updated = await Order.findOneAndUpdate(
        { _id: order._id, status: 'awaiting_payments' },
        {
          $set: { status: 'disputed' },
          $push: {
            status_history: {
              status: 'disputed',
              previous_status: 'awaiting_payments',
              changed_by: order.created_by,
              changed_by_role: 'System',
              timestamp: now,
              note: 'Payment deadline expired with a submitted or confirmed partial payment; manual review required',
            },
          },
        },
        { new: true }
      );
      if (!updated) continue;
      await PaymentObligation.updateMany(
        { order_id: order._id, status: { $in: ['proof_submitted', 'confirmed'] } },
        { $set: { status: 'disputed' } }
      );
      if (updated.inventory_reserved && !updated.inventory_committed) {
        await releaseReservedStockOnce(updated);
      }
      await appendOrderSystemEvent({
        order: updated,
        body: 'انتهت مهلة الدفع مع وجود تحويل جزئي؛ تم تحرير المخزون وتحويل الطلب للمراجعة اليدوية',
        eventType: 'payment_deadline_review',
        metadata: { status: 'disputed', payment_due_at: order.payment_due_at?.toISOString() },
      });
      const recipients = [order.buyer_organization_id, order.seller_organization_id, order.shipper_organization_id]
        .filter(Boolean)
        .filter((recipient, index, values) =>
          values.findIndex((value) => value!.toString() === recipient!.toString()) === index
        );
      await Promise.all(recipients.map((organizationId) => createOrganizationNotification(organizationId!, {
        type: 'system',
        title: `الطلب ${order.order_number} يحتاج مراجعة`,
        body: 'انتهت مهلة الدفع مع وجود تحويل جزئي. تم تحرير المخزون وتحويل العملية للمراجعة.',
        orderId: order._id,
      })));
      movedToReview += 1;
      continue;
    }

    const updated = await Order.findOneAndUpdate(
      { _id: order._id, status: 'awaiting_payments' },
      {
        $set: { status: 'canceled', cancellation_reason: 'Payment deadline expired without submitted proof' },
        $push: {
          status_history: {
            status: 'canceled',
            previous_status: 'awaiting_payments',
            changed_by: order.created_by,
            changed_by_role: 'System',
            timestamp: now,
            note: order.cancellation_reason ?? 'Payment deadline expired without submitted proof',
          },
        },
      },
      { new: true }
    );
    if (!updated) continue;

    await releaseReservedStockOnce(updated);
    await PaymentObligation.deleteMany({ order_id: order._id, status: { $in: ['pending', 'rejected'] } });

    createOrganizationNotification(order.buyer_organization_id, {
      type: 'order_rejected',
      title: `تم إلغاء الطلب ${order.order_number}`,
      body: 'انتهت مهلة الدفع دون إرسال إثبات، وتم تحرير المخزون.',
      orderId: order._id,
    }).catch(() => {});
    canceled += 1;
  }

  return {
    scanned: orders.length,
    canceled,
    moved_to_review: movedToReview,
    // Compatibility for existing operations dashboards.
    retained_for_review: movedToReview,
  };
}
