import { describe, expect, it } from 'vitest';
import { isOrderActionAllowed, OrderRuleContext } from '../lib/orders/order_rules';

const base: OrderRuleContext = {
  status: 'requested',
  fulfillmentMethod: 'third_party_shipping',
  isBuyer: false,
  isSeller: false,
  isShipper: false,
  isAdmin: false,
};

describe('dispute state machine exits (P0-4)', () => {
  it('only admins can exit the disputed state', () => {
    const disputed: OrderRuleContext = { ...base, status: 'disputed' };
    expect(isOrderActionAllowed('resolve_dispute_complete', { ...disputed, isAdmin: true })).toBe(true);
    expect(isOrderActionAllowed('resolve_dispute_cancel', { ...disputed, isAdmin: true })).toBe(true);
    expect(isOrderActionAllowed('resolve_dispute_complete', { ...disputed, isBuyer: true })).toBe(false);
    expect(isOrderActionAllowed('resolve_dispute_cancel', { ...disputed, isSeller: true })).toBe(false);
    expect(isOrderActionAllowed('resolve_dispute_complete', { ...isAdminCtx(), status: 'completed' })).toBe(false);
    function isAdminCtx(): OrderRuleContext {
      return { ...base, isAdmin: true };
    }
  });

  it('dispute resolution cannot be applied to non-disputed orders', () => {
    for (const status of ['requested', 'awaiting_payments', 'preparing', 'canceled', 'rejected']) {
      expect(
        isOrderActionAllowed('resolve_dispute_complete', { ...base, status, isAdmin: true })
      ).toBe(false);
      expect(
        isOrderActionAllowed('resolve_dispute_cancel', { ...base, status, isAdmin: true })
      ).toBe(false);
    }
  });
});

describe('dispute opening eligibility (P0-3)', () => {
  it('rejects disputes on requested orders — buyers cancel instead', () => {
    expect(isOrderActionAllowed('open_dispute', { ...base, isBuyer: true, status: 'requested' })).toBe(false);
  });

  it('allows disputes during active fulfillment and after delivery', () => {
    for (const status of ['awaiting_payments', 'preparing', 'ready_for_pickup', 'in_transit', 'delivered', 'completed']) {
      expect(isOrderActionAllowed('open_dispute', { ...base, isBuyer: true, status })).toBe(true);
    }
  });

  it('never allows disputes on terminal states or by admins directly', () => {
    for (const status of ['rejected', 'canceled', 'disputed']) {
      expect(isOrderActionAllowed('open_dispute', { ...base, isBuyer: true, status })).toBe(false);
    }
    // Admins manage resolution; they do not open disputes as a party.
    expect(isOrderActionAllowed('open_dispute', { ...base, isAdmin: true, status: 'preparing' })).toBe(false);
  });
});

describe('buyer cancellation scope', () => {
  it('admins cannot cancel via buyer path — they must resolve disputes instead', () => {
    expect(isOrderActionAllowed('cancel', { ...base, isAdmin: true, status: 'awaiting_payments' })).toBe(false);
    expect(isOrderActionAllowed('cancel', { ...base, isBuyer: true, status: 'awaiting_payments' })).toBe(true);
  });
});
