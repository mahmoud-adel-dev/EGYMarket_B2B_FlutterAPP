import { describe, expect, it } from 'vitest';
import { decideOrderChatAccess } from '../lib/orders/order_chat_rules';

const base = {
  isAdmin: false,
  isParticipant: true,
  isBuyer: true,
  buyerChatUnlocked: false,
  platformFeeStatus: 'pending',
};

describe('private order chat fee gate', () => {
  it.each(['pending', 'proof_submitted', 'rejected', 'not_issued'])(
    'keeps the buyer locked while platform fee is %s',
    (platformFeeStatus) => {
      expect(decideOrderChatAccess({ ...base, platformFeeStatus })).toEqual({
        allowed: false,
        reason: 'platform_fee_required',
        code: 'PLATFORM_FEE_REQUIRED',
      });
    }
  );

  it('admits the buyer only after confirmation', () => {
    expect(decideOrderChatAccess({ ...base, platformFeeStatus: 'confirmed' })).toEqual({ allowed: true });
  });

  it('preserves access through disputes/refunds after the durable unlock milestone', () => {
    expect(decideOrderChatAccess({
      ...base,
      platformFeeStatus: 'refunded',
      buyerChatUnlocked: true,
    })).toEqual({ allowed: true });
  });

  it('allows the contracted seller/shipper but rejects outsiders', () => {
    expect(decideOrderChatAccess({ ...base, isBuyer: false })).toEqual({ allowed: true });
    expect(decideOrderChatAccess({ ...base, isBuyer: false, isParticipant: false })).toEqual({
      allowed: false,
      reason: 'not_participant',
      code: 'ORDER_PARTICIPANT_REQUIRED',
    });
  });

  it('allows an administrator to audit without impersonating a party', () => {
    expect(decideOrderChatAccess({ ...base, isAdmin: true, isParticipant: false })).toEqual({ allowed: true });
  });
});
