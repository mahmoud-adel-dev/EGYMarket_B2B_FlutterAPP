export type OrderAttentionActorRole = 'Admin' | 'Wholesaler' | 'Retailer' | 'Shipper';
export type OrderAttentionMemberRole = 'owner' | 'manager' | 'staff';

export type OrderAttentionReason =
  | 'seller_review_request'
  | 'seller_review_goods_payment'
  | 'seller_prepare_order'
  | 'buyer_submit_payment'
  | 'buyer_resubmit_payment'
  | 'buyer_confirm_pickup'
  | 'buyer_confirm_delivery'
  | 'shipper_review_shipping_payment'
  | 'shipper_pickup_order'
  | 'shipper_progress_delivery'
  | 'admin_review_platform_fee'
  | 'admin_resolve_dispute';

export type OrderAttentionPriority = 'normal' | 'high';

export interface OrderAttentionActor {
  role: OrderAttentionActorRole;
  organizationId?: string;
  memberRole?: OrderAttentionMemberRole;
}

export interface OrderAttentionOrder {
  id: string;
  status: string;
  fulfillmentMethod: 'buyer_pickup' | 'third_party_shipping';
  buyerOrganizationId: string;
  sellerOrganizationId: string;
  shipperOrganizationId?: string;
  paymentDueAt?: Date | null;
}

export interface OrderAttentionObligation {
  id: string;
  kind: 'platform_fee' | 'goods' | 'shipping';
  status: string;
  payerOrganizationId: string;
  beneficiaryType: 'platform' | 'organization';
  beneficiaryOrganizationId?: string;
}

export interface OrderAttentionTask {
  reason_code: OrderAttentionReason;
  primary_action: string;
  available_actions: string[];
  priority: OrderAttentionPriority;
  obligation_id?: string;
  obligation_kind?: OrderAttentionObligation['kind'];
}

export interface OrderAttentionResult {
  required: boolean;
  reasons: OrderAttentionReason[];
  primary_action?: string;
  tasks: OrderAttentionTask[];
}

export interface OrderAttentionSummary {
  order_count: number;
  task_count: number;
  by_reason: Partial<Record<OrderAttentionReason, number>>;
  generated_at: string;
}

/**
 * Pure, server-owned definition of work that currently requires an actor's action.
 * Optional actions such as cancellation and opening a dispute are intentionally not
 * attention tasks: merely opening the orders tab must never clear this result.
 */
export function evaluateOrderAttention(
  order: OrderAttentionOrder,
  obligations: readonly OrderAttentionObligation[],
  actor: OrderAttentionActor,
  now = new Date()
): OrderAttentionResult {
  const tasks: OrderAttentionTask[] = [];
  const canManage = actor.role === 'Admin' || actor.memberRole === 'owner' || actor.memberRole === 'manager';
  const organizationId = actor.organizationId;

  if (actor.role === 'Admin') {
    if (order.status === 'disputed') {
      tasks.push(task(
        'admin_resolve_dispute',
        'resolve_dispute_complete',
        ['resolve_dispute_complete', 'resolve_dispute_cancel'],
        'high'
      ));
    }
    for (const obligation of obligations) {
      if (
        obligation.kind === 'platform_fee' &&
        obligation.beneficiaryType === 'platform' &&
        obligation.status === 'proof_submitted'
      ) {
        tasks.push(paymentTask(
          'admin_review_platform_fee',
          'review_payment_proof',
          obligation,
          'high'
        ));
      }
    }
    return result(tasks);
  }

  if (!organizationId) return result(tasks);

  const isSeller = actor.role === 'Wholesaler' && order.sellerOrganizationId === organizationId;
  const isBuyer = actor.role === 'Retailer' && order.buyerOrganizationId === organizationId;
  const isShipper = actor.role === 'Shipper' && order.shipperOrganizationId === organizationId;

  if (isSeller && canManage) {
    if (order.status === 'requested') {
      tasks.push(task('seller_review_request', 'accept', ['accept', 'reject'], 'high'));
    } else if (order.status === 'preparing') {
      tasks.push(task('seller_prepare_order', 'mark_ready', ['mark_ready'], 'normal'));
    }
    for (const obligation of obligations) {
      if (
        obligation.kind === 'goods' &&
        obligation.beneficiaryOrganizationId === organizationId &&
        obligation.status === 'proof_submitted'
      ) {
        tasks.push(paymentTask(
          'seller_review_goods_payment',
          'review_payment_proof',
          obligation,
          'high'
        ));
      }
    }
  }

  if (isBuyer && canManage) {
    const deadlineOpen = !order.paymentDueAt || order.paymentDueAt.getTime() > now.getTime();
    if (order.status === 'awaiting_payments' && deadlineOpen) {
      for (const obligation of obligations) {
        if (obligation.payerOrganizationId !== organizationId) continue;
        if (obligation.status === 'pending') {
          tasks.push(paymentTask(
            'buyer_submit_payment',
            'submit_payment_proof',
            obligation,
            'normal'
          ));
        } else if (obligation.status === 'rejected') {
          tasks.push(paymentTask(
            'buyer_resubmit_payment',
            'submit_payment_proof',
            obligation,
            'high'
          ));
        }
      }
    }
    if (order.fulfillmentMethod === 'buyer_pickup' && order.status === 'ready_for_pickup') {
      tasks.push(task('buyer_confirm_pickup', 'confirm_receipt', ['confirm_receipt'], 'high'));
    }
    if (order.fulfillmentMethod === 'third_party_shipping' && order.status === 'delivered') {
      tasks.push(task('buyer_confirm_delivery', 'confirm_receipt', ['confirm_receipt'], 'high'));
    }
  }

  if (isShipper) {
    if (canManage) {
      for (const obligation of obligations) {
        if (
          obligation.kind === 'shipping' &&
          obligation.beneficiaryOrganizationId === organizationId &&
          obligation.status === 'proof_submitted'
        ) {
          tasks.push(paymentTask(
            'shipper_review_shipping_payment',
            'review_payment_proof',
            obligation,
            'high'
          ));
        }
      }
    }
    if (order.fulfillmentMethod === 'third_party_shipping' && order.status === 'ready_for_pickup') {
      tasks.push(task('shipper_pickup_order', 'confirm_pickup', ['confirm_pickup'], 'high'));
    } else if (order.fulfillmentMethod === 'third_party_shipping' && order.status === 'in_transit') {
      tasks.push(task(
        'shipper_progress_delivery',
        'confirm_delivery',
        ['add_tracking_checkpoint', 'confirm_delivery'],
        'normal'
      ));
    }
  }

  return result(tasks);
}

/** Count unique orders, while retaining a separate deduplicated task total. */
export function summarizeOrderAttention(
  rows: readonly { orderId: string; attention: OrderAttentionResult }[],
  generatedAt = new Date()
): OrderAttentionSummary {
  const tasksByOrder = new Map<string, Map<string, OrderAttentionTask>>();
  for (const row of rows) {
    if (!row.attention.required) continue;
    const orderTasks = tasksByOrder.get(row.orderId) ?? new Map<string, OrderAttentionTask>();
    for (const attentionTask of row.attention.tasks) {
      const taskKey = `${attentionTask.reason_code}:${attentionTask.obligation_id ?? ''}:${attentionTask.primary_action}`;
      orderTasks.set(taskKey, attentionTask);
    }
    if (orderTasks.size) tasksByOrder.set(row.orderId, orderTasks);
  }

  const ordersByReason = new Map<OrderAttentionReason, Set<string>>();
  let taskCount = 0;
  for (const [orderId, orderTasks] of tasksByOrder) {
    taskCount += orderTasks.size;
    for (const attentionTask of orderTasks.values()) {
      const orderIds = ordersByReason.get(attentionTask.reason_code) ?? new Set<string>();
      orderIds.add(orderId);
      ordersByReason.set(attentionTask.reason_code, orderIds);
    }
  }

  return {
    order_count: tasksByOrder.size,
    task_count: taskCount,
    by_reason: Object.fromEntries(
      [...ordersByReason.entries()].map(([reason, orderIds]) => [reason, orderIds.size])
    ) as Partial<Record<OrderAttentionReason, number>>,
    generated_at: generatedAt.toISOString(),
  };
}

function task(
  reasonCode: OrderAttentionReason,
  primaryAction: string,
  availableActions: string[],
  priority: OrderAttentionPriority
): OrderAttentionTask {
  return {
    reason_code: reasonCode,
    primary_action: primaryAction,
    available_actions: availableActions,
    priority,
  };
}

function paymentTask(
  reasonCode: OrderAttentionReason,
  primaryAction: string,
  obligation: OrderAttentionObligation,
  priority: OrderAttentionPriority
): OrderAttentionTask {
  return {
    ...task(reasonCode, primaryAction, [primaryAction], priority),
    obligation_id: obligation.id,
    obligation_kind: obligation.kind,
  };
}

function result(tasks: OrderAttentionTask[]): OrderAttentionResult {
  const priorityRank: Record<OrderAttentionPriority, number> = { high: 0, normal: 1 };
  const sortedTasks = [...tasks].sort((left, right) => {
    const priorityDifference = priorityRank[left.priority] - priorityRank[right.priority];
    if (priorityDifference !== 0) return priorityDifference;
    const reasonDifference = left.reason_code.localeCompare(right.reason_code);
    if (reasonDifference !== 0) return reasonDifference;
    return (left.obligation_id ?? '').localeCompare(right.obligation_id ?? '');
  });
  return {
    required: sortedTasks.length > 0,
    reasons: [...new Set(sortedTasks.map((attentionTask) => attentionTask.reason_code))],
    primary_action: sortedTasks[0]?.primary_action,
    tasks: sortedTasks,
  };
}
