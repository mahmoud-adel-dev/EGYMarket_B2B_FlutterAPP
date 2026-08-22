import { describe, expect, it } from 'vitest';
import {
  evaluateOrderAttention,
  OrderAttentionActor,
  OrderAttentionObligation,
  OrderAttentionOrder,
  summarizeOrderAttention,
} from '../lib/orders/order_attention';

const NOW = new Date('2026-08-22T12:00:00.000Z');

function order(overrides: Partial<OrderAttentionOrder> = {}): OrderAttentionOrder {
  return {
    id: 'order-1',
    status: 'requested',
    fulfillmentMethod: 'third_party_shipping',
    buyerOrganizationId: 'buyer-1',
    sellerOrganizationId: 'seller-1',
    shipperOrganizationId: 'shipper-1',
    paymentDueAt: new Date('2026-08-23T12:00:00.000Z'),
    ...overrides,
  };
}

function obligation(
  overrides: Partial<OrderAttentionObligation> = {}
): OrderAttentionObligation {
  return {
    id: 'payment-1',
    kind: 'goods',
    status: 'pending',
    payerOrganizationId: 'buyer-1',
    beneficiaryType: 'organization',
    beneficiaryOrganizationId: 'seller-1',
    ...overrides,
  };
}

const sellerOwner: OrderAttentionActor = {
  role: 'Wholesaler',
  organizationId: 'seller-1',
  memberRole: 'owner',
};
const buyerManager: OrderAttentionActor = {
  role: 'Retailer',
  organizationId: 'buyer-1',
  memberRole: 'manager',
};
const shipperStaff: OrderAttentionActor = {
  role: 'Shipper',
  organizationId: 'shipper-1',
  memberRole: 'staff',
};

describe('order attention evaluator', () => {
  it('requires an owner or manager to review and prepare seller orders', () => {
    const requested = evaluateOrderAttention(order(), [], sellerOwner, NOW);
    expect(requested.required).toBe(true);
    expect(requested.reasons).toEqual(['seller_review_request']);
    expect(requested.tasks[0].available_actions).toEqual(['accept', 'reject']);

    const preparing = evaluateOrderAttention(
      order({ status: 'preparing' }),
      [],
      sellerOwner,
      NOW
    );
    expect(preparing.primary_action).toBe('mark_ready');

    const sellerStaff = evaluateOrderAttention(order(), [], {
      ...sellerOwner,
      memberRole: 'staff',
    }, NOW);
    expect(sellerStaff.required).toBe(false);
  });

  it('flags submitted goods proof only for the beneficiary seller manager', () => {
    const goodsProof = obligation({ status: 'proof_submitted' });
    const result = evaluateOrderAttention(
      order({ status: 'awaiting_payments' }),
      [goodsProof],
      sellerOwner,
      NOW
    );
    expect(result.reasons).toEqual(['seller_review_goods_payment']);
    expect(result.tasks[0]).toMatchObject({
      primary_action: 'review_payment_proof',
      obligation_id: 'payment-1',
      obligation_kind: 'goods',
    });

    expect(evaluateOrderAttention(
      order({ status: 'awaiting_payments' }),
      [goodsProof],
      { ...sellerOwner, organizationId: 'another-seller' },
      NOW
    ).required).toBe(false);
  });

  it('creates one buyer payment task per pending or rejected obligation', () => {
    const result = evaluateOrderAttention(
      order({ status: 'awaiting_payments' }),
      [
        obligation({ id: 'goods', status: 'pending' }),
        obligation({
          id: 'platform',
          kind: 'platform_fee',
          beneficiaryType: 'platform',
          beneficiaryOrganizationId: undefined,
          status: 'rejected',
        }),
        obligation({
          id: 'shipping',
          kind: 'shipping',
          beneficiaryOrganizationId: 'shipper-1',
          status: 'proof_submitted',
        }),
      ],
      buyerManager,
      NOW
    );

    expect(result.required).toBe(true);
    expect(result.tasks).toHaveLength(2);
    expect(result.reasons).toEqual(['buyer_resubmit_payment', 'buyer_submit_payment']);
    expect(result.primary_action).toBe('submit_payment_proof');
  });

  it('does not offer payment after the deadline or to buyer staff', () => {
    const expiredOrder = order({
      status: 'awaiting_payments',
      paymentDueAt: new Date('2026-08-22T11:59:59.000Z'),
    });
    expect(evaluateOrderAttention(
      expiredOrder,
      [obligation()],
      buyerManager,
      NOW
    ).required).toBe(false);
    expect(evaluateOrderAttention(
      order({ status: 'awaiting_payments' }),
      [obligation()],
      { ...buyerManager, memberRole: 'staff' },
      NOW
    ).required).toBe(false);
  });

  it('requires buyer receipt only at the fulfillment endpoint', () => {
    expect(evaluateOrderAttention(
      order({ status: 'ready_for_pickup', fulfillmentMethod: 'buyer_pickup' }),
      [],
      buyerManager,
      NOW
    ).reasons).toEqual(['buyer_confirm_pickup']);
    expect(evaluateOrderAttention(
      order({ status: 'delivered', fulfillmentMethod: 'third_party_shipping' }),
      [],
      buyerManager,
      NOW
    ).reasons).toEqual(['buyer_confirm_delivery']);
    expect(evaluateOrderAttention(
      order({ status: 'ready_for_pickup', fulfillmentMethod: 'third_party_shipping' }),
      [],
      buyerManager,
      NOW
    ).required).toBe(false);
  });

  it('allows shipper staff to operate custody, but reserves payment review for management', () => {
    expect(evaluateOrderAttention(
      order({ status: 'ready_for_pickup' }),
      [],
      shipperStaff,
      NOW
    ).reasons).toEqual(['shipper_pickup_order']);

    const transit = evaluateOrderAttention(
      order({ status: 'in_transit' }),
      [],
      shipperStaff,
      NOW
    );
    expect(transit.reasons).toEqual(['shipper_progress_delivery']);
    expect(transit.tasks[0].available_actions).toEqual([
      'add_tracking_checkpoint',
      'confirm_delivery',
    ]);

    const shippingProof = obligation({
      kind: 'shipping',
      status: 'proof_submitted',
      beneficiaryOrganizationId: 'shipper-1',
    });
    expect(evaluateOrderAttention(
      order({ status: 'awaiting_payments' }),
      [shippingProof],
      shipperStaff,
      NOW
    ).required).toBe(false);
    expect(evaluateOrderAttention(
      order({ status: 'awaiting_payments' }),
      [shippingProof],
      { ...shipperStaff, memberRole: 'manager' },
      NOW
    ).reasons).toEqual(['shipper_review_shipping_payment']);
  });

  it('gives admins only platform-review and dispute-resolution work', () => {
    const admin: OrderAttentionActor = { role: 'Admin' };
    const platformProof = obligation({
      kind: 'platform_fee',
      status: 'proof_submitted',
      beneficiaryType: 'platform',
      beneficiaryOrganizationId: undefined,
    });
    expect(evaluateOrderAttention(
      order({ status: 'awaiting_payments' }),
      [platformProof],
      admin,
      NOW
    ).reasons).toEqual(['admin_review_platform_fee']);
    expect(evaluateOrderAttention(
      order({ status: 'disputed' }),
      [],
      admin,
      NOW
    ).reasons).toEqual(['admin_resolve_dispute']);
    expect(evaluateOrderAttention(order(), [], admin, NOW).required).toBe(false);
  });

  it.each(['completed', 'canceled', 'rejected'])(
    'does not badge terminal %s orders for commercial parties',
    (status) => {
      expect(evaluateOrderAttention(
        order({ status }),
        [obligation({ status: 'confirmed' })],
        sellerOwner,
        NOW
      ).required).toBe(false);
      expect(evaluateOrderAttention(
        order({ status }),
        [obligation({ status: 'confirmed' })],
        buyerManager,
        NOW
      ).required).toBe(false);
    }
  );
});

describe('order attention summary', () => {
  it('deduplicates an order while retaining distinct obligation tasks', () => {
    const attention = evaluateOrderAttention(
      order({ status: 'awaiting_payments' }),
      [
        obligation({ id: 'goods' }),
        obligation({
          id: 'platform',
          kind: 'platform_fee',
          beneficiaryType: 'platform',
          beneficiaryOrganizationId: undefined,
        }),
      ],
      buyerManager,
      NOW
    );
    const generatedAt = new Date('2026-08-22T12:01:00.000Z');
    const summary = summarizeOrderAttention([
      { orderId: 'order-1', attention },
      { orderId: 'order-1', attention },
      {
        orderId: 'order-2',
        attention: evaluateOrderAttention(
          order({ id: 'order-2', status: 'awaiting_payments' }),
          [obligation({ id: 'order-2-goods' })],
          buyerManager,
          NOW
        ),
      },
    ], generatedAt);

    expect(summary).toEqual({
      order_count: 2,
      task_count: 3,
      by_reason: { buyer_submit_payment: 2 },
      generated_at: '2026-08-22T12:01:00.000Z',
    });
  });
});
