export interface OrderChatRuleContext {
  isAdmin: boolean;
  isParticipant: boolean;
  isBuyer: boolean;
  buyerChatUnlocked: boolean;
  platformFeeStatus: string;
}

export type OrderChatRuleDecision =
  | { allowed: true }
  | { allowed: false; reason: 'not_participant'; code: 'ORDER_PARTICIPANT_REQUIRED' }
  | { allowed: false; reason: 'platform_fee_required'; code: 'PLATFORM_FEE_REQUIRED' };

/** Pure access rule used by the database adapter and unit tests. */
export function decideOrderChatAccess(context: OrderChatRuleContext): OrderChatRuleDecision {
  if (context.isAdmin) return { allowed: true };
  if (!context.isParticipant) {
    return { allowed: false, reason: 'not_participant', code: 'ORDER_PARTICIPANT_REQUIRED' };
  }
  if (context.isBuyer && !context.buyerChatUnlocked && context.platformFeeStatus !== 'confirmed') {
    return { allowed: false, reason: 'platform_fee_required', code: 'PLATFORM_FEE_REQUIRED' };
  }
  return { allowed: true };
}
