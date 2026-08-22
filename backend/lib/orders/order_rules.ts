export type OrderAction =
  | 'accept'
  | 'reject'
  | 'mark_ready'
  | 'confirm_pickup'
  | 'confirm_delivery'
  | 'confirm_receipt'
  | 'cancel'
  | 'open_dispute'
  | 'resolve_dispute_complete'
  | 'resolve_dispute_cancel';

/** Statuses from which an order may enter a dispute. */
export const DISPUTE_ELIGIBLE_STATUSES = [
  'awaiting_payments',
  'preparing',
  'ready_for_pickup',
  'in_transit',
  'delivered',
  'completed',
] as const;

export interface OrderRuleContext {
  status: string;
  fulfillmentMethod: 'buyer_pickup' | 'third_party_shipping';
  isBuyer: boolean;
  isSeller: boolean;
  isShipper: boolean;
  isAdmin: boolean;
}

/** Pure authorization/state rule shared by the API and unit tests. */
export function isOrderActionAllowed(action: OrderAction, context: OrderRuleContext): boolean {
  // Admins audit and resolve disputes; they must not impersonate commercial
  // parties for acceptance, custody or receipt milestones.
  const seller = context.isSeller;
  const buyer = context.isBuyer;
  const shipper = context.isShipper;

  switch (action) {
    case 'accept':
    case 'reject':
      return seller && context.status === 'requested';
    case 'mark_ready':
      return seller && context.status === 'preparing';
    case 'confirm_pickup':
      return shipper && context.fulfillmentMethod === 'third_party_shipping' && context.status === 'ready_for_pickup';
    case 'confirm_delivery':
      return shipper && context.fulfillmentMethod === 'third_party_shipping' && context.status === 'in_transit';
    case 'confirm_receipt':
      return buyer && (
        (context.fulfillmentMethod === 'buyer_pickup' && context.status === 'ready_for_pickup') ||
        (context.fulfillmentMethod === 'third_party_shipping' && context.status === 'delivered')
      );
    case 'cancel':
      // Admins unwind orders only through dispute resolution; buyers cancel pre-payment.
      return context.isBuyer && ['requested', 'awaiting_payments'].includes(context.status);
    case 'open_dispute':
      // `requested` orders have no money movement yet — buyers cancel instead.
      return (context.isBuyer || context.isSeller || context.isShipper) &&
        (DISPUTE_ELIGIBLE_STATUSES as readonly string[]).includes(context.status);
    case 'resolve_dispute_complete':
    case 'resolve_dispute_cancel':
      // Only platform admins exit the disputed state; both resolutions are recorded.
      return context.isAdmin && context.status === 'disputed';
  }
}
