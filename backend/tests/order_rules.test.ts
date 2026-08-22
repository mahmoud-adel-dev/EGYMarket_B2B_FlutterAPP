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

describe('order state and participant authorization', () => {
  it('allows only the seller to accept a requested order', () => {
    expect(isOrderActionAllowed('accept', { ...base, isSeller: true })).toBe(true);
    expect(isOrderActionAllowed('accept', { ...base, isBuyer: true })).toBe(false);
    expect(isOrderActionAllowed('accept', { ...base, isAdmin: true })).toBe(false);
    expect(isOrderActionAllowed('accept', { ...base, isSeller: true, status: 'preparing' })).toBe(false);
  });

  it('enforces the third-party chain of custody', () => {
    expect(isOrderActionAllowed('confirm_pickup', {
      ...base,
      isShipper: true,
      status: 'ready_for_pickup',
    })).toBe(true);
    expect(isOrderActionAllowed('confirm_delivery', {
      ...base,
      isShipper: true,
      status: 'ready_for_pickup',
    })).toBe(false);
    expect(isOrderActionAllowed('confirm_delivery', {
      ...base,
      isShipper: true,
      status: 'in_transit',
    })).toBe(true);
  });

  it('allows buyer receipt only at the correct fulfillment endpoint', () => {
    expect(isOrderActionAllowed('confirm_receipt', {
      ...base,
      isBuyer: true,
      status: 'delivered',
    })).toBe(true);
    expect(isOrderActionAllowed('confirm_receipt', {
      ...base,
      isBuyer: true,
      fulfillmentMethod: 'buyer_pickup',
      status: 'ready_for_pickup',
    })).toBe(true);
    expect(isOrderActionAllowed('confirm_receipt', {
      ...base,
      isBuyer: true,
      status: 'in_transit',
    })).toBe(false);
  });

  it('prevents late cancellation and disputes on terminal rejections', () => {
    expect(isOrderActionAllowed('cancel', { ...base, isBuyer: true, status: 'awaiting_payments' })).toBe(true);
    expect(isOrderActionAllowed('cancel', { ...base, isBuyer: true, status: 'preparing' })).toBe(false);
    expect(isOrderActionAllowed('open_dispute', { ...base, isBuyer: true, status: 'rejected' })).toBe(false);
  });
});
