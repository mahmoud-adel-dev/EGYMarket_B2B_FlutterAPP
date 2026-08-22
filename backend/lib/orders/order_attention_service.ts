import type { FilterQuery } from 'mongoose';
import type { SessionContext } from '@/lib/auth/withAuth';
import Order, { IOrder } from '@/models/Order';
import PaymentObligation from '@/models/PaymentObligation';
import {
  evaluateOrderAttention,
  OrderAttentionActor,
  OrderAttentionObligation,
  OrderAttentionOrder,
  OrderAttentionSummary,
  summarizeOrderAttention,
} from '@/lib/orders/order_attention';

const SELLER_CANDIDATE_STATUSES = ['requested', 'awaiting_payments', 'preparing'] as const;
const BUYER_CANDIDATE_STATUSES = ['awaiting_payments', 'ready_for_pickup', 'delivered'] as const;
const SHIPPER_CANDIDATE_STATUSES = ['awaiting_payments', 'ready_for_pickup', 'in_transit'] as const;

export function orderAttentionActorFromSession(session: SessionContext): OrderAttentionActor {
  return {
    role: session.user.role,
    organizationId: session.user.organizationId,
    memberRole: session.user.organizationMemberRole,
  };
}

export function toAttentionOrder(order: {
  _id: unknown;
  status: string;
  fulfillment_method: 'buyer_pickup' | 'third_party_shipping';
  buyer_organization_id: unknown;
  seller_organization_id: unknown;
  shipper_organization_id?: unknown;
  payment_due_at?: Date | null;
}): OrderAttentionOrder {
  return {
    id: idString(order._id),
    status: order.status,
    fulfillmentMethod: order.fulfillment_method,
    buyerOrganizationId: idString(order.buyer_organization_id),
    sellerOrganizationId: idString(order.seller_organization_id),
    shipperOrganizationId: optionalIdString(order.shipper_organization_id),
    paymentDueAt: order.payment_due_at,
  };
}

export function toAttentionObligation(obligation: {
  _id: unknown;
  kind: 'platform_fee' | 'goods' | 'shipping';
  status: string;
  payer_organization_id: unknown;
  beneficiary_type: 'platform' | 'organization';
  beneficiary_organization_id?: unknown;
}): OrderAttentionObligation {
  return {
    id: idString(obligation._id),
    kind: obligation.kind,
    status: obligation.status,
    payerOrganizationId: idString(obligation.payer_organization_id),
    beneficiaryType: obligation.beneficiary_type,
    beneficiaryOrganizationId: optionalIdString(obligation.beneficiary_organization_id),
  };
}

/** Load only candidate workflow states, then apply the same pure evaluator used by DTOs. */
export async function getOrderAttentionSummary(
  session: SessionContext,
  now = new Date()
): Promise<OrderAttentionSummary> {
  const actor = orderAttentionActorFromSession(session);
  const filter = await candidateFilter(session);
  if (!filter) return summarizeOrderAttention([], now);

  const orders = await Order.find(filter)
    .select(
      '_id status fulfillment_method buyer_organization_id seller_organization_id ' +
      'shipper_organization_id payment_due_at'
    )
    .lean();
  if (!orders.length) return summarizeOrderAttention([], now);

  const obligations = await PaymentObligation.find({
    order_id: { $in: orders.map((order) => order._id) },
  })
    .select(
      '_id order_id kind status payer_organization_id beneficiary_type ' +
      'beneficiary_organization_id'
    )
    .lean();
  const obligationsByOrder = new Map<string, OrderAttentionObligation[]>();
  for (const obligation of obligations) {
    const orderId = idString(obligation.order_id);
    const current = obligationsByOrder.get(orderId) ?? [];
    current.push(toAttentionObligation(obligation));
    obligationsByOrder.set(orderId, current);
  }

  return summarizeOrderAttention(
    orders.map((order) => {
      const attentionOrder = toAttentionOrder(order);
      return {
        orderId: attentionOrder.id,
        attention: evaluateOrderAttention(
          attentionOrder,
          obligationsByOrder.get(attentionOrder.id) ?? [],
          actor,
          now
        ),
      };
    }),
    now
  );
}

async function candidateFilter(session: SessionContext): Promise<FilterQuery<IOrder> | null> {
  const organizationId = session.user.organizationId;
  const memberCanManage = ['owner', 'manager'].includes(session.user.organizationMemberRole ?? '');

  if (session.user.role === 'Admin') {
    const platformReviewOrderIds = await PaymentObligation.distinct('order_id', {
      kind: 'platform_fee',
      beneficiary_type: 'platform',
      status: 'proof_submitted',
    });
    return {
      $or: [
        { status: 'disputed' },
        { _id: { $in: platformReviewOrderIds } },
      ],
    };
  }

  if (!organizationId) return null;
  if (session.user.role === 'Wholesaler') {
    if (!memberCanManage) return null;
    return {
      seller_organization_id: organizationId,
      status: { $in: SELLER_CANDIDATE_STATUSES },
    };
  }
  if (session.user.role === 'Retailer') {
    if (!memberCanManage) return null;
    return {
      buyer_organization_id: organizationId,
      status: { $in: BUYER_CANDIDATE_STATUSES },
    };
  }
  if (session.user.role === 'Shipper') {
    return {
      shipper_organization_id: organizationId,
      status: { $in: SHIPPER_CANDIDATE_STATUSES },
    };
  }
  return null;
}

function optionalIdString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const resolved = idString(value);
  return resolved || undefined;
}

function idString(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object' && '_id' in value) {
    return String((value as { _id: unknown })._id);
  }
  return String(value);
}
