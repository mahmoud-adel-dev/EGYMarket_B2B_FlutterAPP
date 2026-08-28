import 'package:easy_localization/easy_localization.dart';

enum OrderStatus {
  requested,
  rejected,
  awaitingPayments,
  preparing,
  readyForPickup,
  inTransit,
  delivered,
  completed,
  canceled,
  disputed,
  unknown;

  String get displayName => switch (this) {
    OrderStatus.requested => tr('order_status_requested'),
    OrderStatus.rejected => tr('order_status_rejected'),
    OrderStatus.awaitingPayments => tr('order_status_awaiting_payments'),
    OrderStatus.preparing => tr('order_status_preparing'),
    OrderStatus.readyForPickup => tr('order_status_ready_for_pickup'),
    OrderStatus.inTransit => tr('order_status_in_transit'),
    OrderStatus.delivered => tr('order_status_delivered'),
    OrderStatus.completed => tr('order_status_completed'),
    OrderStatus.canceled => tr('order_status_canceled'),
    OrderStatus.disputed => tr('order_status_disputed'),
    OrderStatus.unknown => tr('order_status_unknown'),
  };

  static OrderStatus fromString(String? value) {
    switch (value) {
      case 'rejected':
        return rejected;
      case 'awaiting_payments':
        return awaitingPayments;
      case 'preparing':
        return preparing;
      case 'ready_for_pickup':
        return readyForPickup;
      case 'in_transit':
        return inTransit;
      case 'delivered':
        return delivered;
      case 'completed':
        return completed;
      case 'canceled':
        return canceled;
      case 'disputed':
        return disputed;
      case 'requested':
        return requested;
      default:
        return unknown;
    }
  }
}

class OrderChatAccessModel {
  final bool allowed;
  final String? reasonCode;
  final String platformFeeStatus;
  final int platformFeeAmountPiasters;
  final String? conversationId;

  const OrderChatAccessModel({
    required this.allowed,
    this.reasonCode,
    required this.platformFeeStatus,
    required this.platformFeeAmountPiasters,
    this.conversationId,
  });

  factory OrderChatAccessModel.fromJson(Map<String, dynamic> json) =>
      OrderChatAccessModel(
        allowed: json['allowed'] == true,
        reasonCode: json['reason_code']?.toString(),
        platformFeeStatus:
            json['platform_fee_status']?.toString() ?? 'not_issued',
        platformFeeAmountPiasters:
            (json['platform_fee_amount_piasters'] as num?)?.toInt() ?? 5000,
        conversationId: json['conversation_id']?.toString(),
      );
}

class OrderTrackingEventModel {
  final String id;
  final String eventType;
  final String location;
  final String? note;
  final DateTime? occurredAt;
  final String organizationName;

  const OrderTrackingEventModel({
    required this.id,
    required this.eventType,
    required this.location,
    this.note,
    this.occurredAt,
    this.organizationName = '',
  });

  factory OrderTrackingEventModel.fromJson(Map<String, dynamic> json) {
    final organization = json['created_by_organization_id'] is Map
        ? Map<String, dynamic>.from(json['created_by_organization_id'] as Map)
        : const <String, dynamic>{};
    return OrderTrackingEventModel(
      id: json['_id']?.toString() ?? '',
      eventType: json['event_type']?.toString() ?? 'checkpoint',
      location: json['location']?.toString() ?? '',
      note: json['note']?.toString(),
      occurredAt: DateTime.tryParse(json['occurred_at']?.toString() ?? ''),
      organizationName: organization['display_name']?.toString() ?? '',
    );
  }
}

class OrderStatusHistoryModel {
  final OrderStatus status;
  final String changedByRole;
  final DateTime? timestamp;
  final String? note;
  const OrderStatusHistoryModel({
    required this.status,
    required this.changedByRole,
    this.timestamp,
    this.note,
  });

  factory OrderStatusHistoryModel.fromJson(Map<String, dynamic> json) =>
      OrderStatusHistoryModel(
        status: OrderStatus.fromString(json['status']?.toString()),
        changedByRole: json['changed_by_role']?.toString() ?? 'System',
        timestamp: DateTime.tryParse(json['timestamp']?.toString() ?? ''),
        note: json['note']?.toString(),
      );
}

class PaymentObligationModel {
  final String id;
  final String kind;
  final int amountPiasters;
  final String status;
  final String? beneficiaryOrganizationId;
  final List<Map<String, dynamic>> accounts;
  final String? paymentMethod;
  final String? proofUrl;
  final String? rejectionReason;
  final String? senderReference;
  final DateTime? payerConfirmedAt;
  final DateTime? beneficiaryConfirmedAt;

  const PaymentObligationModel({
    required this.id,
    required this.kind,
    required this.amountPiasters,
    required this.status,
    this.beneficiaryOrganizationId,
    this.accounts = const [],
    this.paymentMethod,
    this.proofUrl,
    this.rejectionReason,
    this.senderReference,
    this.payerConfirmedAt,
    this.beneficiaryConfirmedAt,
  });

  factory PaymentObligationModel.fromJson(Map<String, dynamic> json) {
    final snapshot =
        json['payment_account_snapshot'] as Map<String, dynamic>? ?? {};
    final rows = snapshot['accounts'] as List<dynamic>? ?? const [];
    return PaymentObligationModel(
      id: json['_id']?.toString() ?? '',
      kind: json['kind']?.toString() ?? '',
      amountPiasters: (json['amount_piasters'] as num?)?.toInt() ?? 0,
      status: json['status']?.toString() ?? 'pending',
      beneficiaryOrganizationId: json['beneficiary_organization_id']
          ?.toString(),
      accounts: rows
          .map((row) => Map<String, dynamic>.from(row as Map))
          .toList(),
      paymentMethod: json['payment_method']?.toString(),
      proofUrl: json['proof_url']?.toString(),
      rejectionReason: json['rejection_reason']?.toString(),
      senderReference: json['sender_reference']?.toString(),
      payerConfirmedAt: DateTime.tryParse(
        json['payer_confirmed_at']?.toString() ?? '',
      ),
      beneficiaryConfirmedAt: DateTime.tryParse(
        json['beneficiary_confirmed_at']?.toString() ?? '',
      ),
    );
  }
}

class OrderAttentionModel {
  final bool requiresAction;
  final int taskCount;
  final List<String> reasons;

  const OrderAttentionModel({
    required this.requiresAction,
    required this.taskCount,
    this.reasons = const [],
  });

  factory OrderAttentionModel.fromJson(Map<String, dynamic> json) {
    final rawReasons =
        json['reasons'] as List<dynamic>? ??
        json['reason_codes'] as List<dynamic>? ??
        const [];
    return OrderAttentionModel(
      requiresAction:
          json['requires_action'] == true ||
          ((json['task_count'] as num?)?.toInt() ?? 0) > 0,
      taskCount: (json['task_count'] as num?)?.toInt() ?? rawReasons.length,
      reasons: rawReasons.map((reason) => reason.toString()).toList(),
    );
  }
}

class B2BOrderModel {
  final String id;
  final String orderNumber;
  final String sellerName;
  final String buyerName;
  final String shipperName;
  final String sellerOrganizationId;
  final String buyerOrganizationId;
  final String? shipperOrganizationId;
  final int goodsSubtotalPiasters;
  final int shippingCostPiasters;
  final int platformFeePiasters;
  final int totalPayablePiasters;
  final int totalUnits;
  final String fulfillmentMethod;
  final OrderStatus status;
  final DateTime? createdAt;
  final DateTime? paymentDueAt;
  final List<OrderStatusHistoryModel> statusHistory;
  final List<PaymentObligationModel> obligations;
  final OrderChatAccessModel? chatAccess;
  final List<String> allowedActions;
  final List<OrderTrackingEventModel> trackingEvents;
  final String paymentState;
  final OrderAttentionModel? attention;

  const B2BOrderModel({
    required this.id,
    required this.orderNumber,
    required this.sellerName,
    required this.buyerName,
    required this.shipperName,
    required this.sellerOrganizationId,
    required this.buyerOrganizationId,
    this.shipperOrganizationId,
    required this.goodsSubtotalPiasters,
    required this.shippingCostPiasters,
    required this.platformFeePiasters,
    required this.totalPayablePiasters,
    required this.totalUnits,
    required this.fulfillmentMethod,
    required this.status,
    this.createdAt,
    this.paymentDueAt,
    this.statusHistory = const [],
    this.obligations = const [],
    this.chatAccess,
    this.allowedActions = const [],
    this.trackingEvents = const [],
    this.paymentState = 'not_issued',
    this.attention,
  });

  double get totalAmount => totalPayablePiasters / 100;
  double get shippingCost => shippingCostPiasters / 100;

  factory B2BOrderModel.fromJson(
    Map<String, dynamic> json, {
    List<dynamic>? obligations,
    Map<String, dynamic>? chatAccess,
    List<dynamic>? allowedActions,
    List<dynamic>? trackingEvents,
    Map<String, dynamic>? paymentSummary,
    Map<String, dynamic>? attention,
  }) {
    Map<String, dynamic> object(String key) => json[key] is Map<String, dynamic>
        ? json[key] as Map<String, dynamic>
        : {'_id': json[key]};
    final seller = object('seller_organization_id');
    final buyer = object('buyer_organization_id');
    final shipper = object('shipper_organization_id');
    final items = json['items'] as List<dynamic>? ?? const [];
    final history = json['status_history'] as List<dynamic>? ?? const [];
    final resolvedChatAccess =
        chatAccess ??
        (json['chat_access'] is Map
            ? Map<String, dynamic>.from(json['chat_access'] as Map)
            : null);
    final resolvedAllowedActions =
        allowedActions ?? json['allowed_actions'] as List<dynamic>?;
    final resolvedTrackingEvents =
        trackingEvents ?? json['tracking_events'] as List<dynamic>?;
    final resolvedPaymentSummary =
        paymentSummary ??
        (json['payment_summary'] is Map
            ? Map<String, dynamic>.from(json['payment_summary'] as Map)
            : null);
    final resolvedAttention =
        attention ??
        (json['attention'] is Map
            ? Map<String, dynamic>.from(json['attention'] as Map)
            : null);
    return B2BOrderModel(
      id: json['_id']?.toString() ?? '',
      orderNumber: json['order_number']?.toString() ?? '',
      sellerName: seller['display_name']?.toString() ?? tr('order_seller'),
      buyerName: buyer['display_name']?.toString() ?? tr('order_buyer'),
      shipperName: shipper['display_name']?.toString() ?? '',
      sellerOrganizationId: seller['_id']?.toString() ?? '',
      buyerOrganizationId: buyer['_id']?.toString() ?? '',
      shipperOrganizationId: shipper['_id']?.toString(),
      goodsSubtotalPiasters:
          (json['goods_subtotal_piasters'] as num?)?.toInt() ?? 0,
      shippingCostPiasters:
          (json['shipping_cost_piasters'] as num?)?.toInt() ?? 0,
      platformFeePiasters:
          (json['platform_fee_piasters'] as num?)?.toInt() ?? 5000,
      totalPayablePiasters:
          (json['total_payable_piasters'] as num?)?.toInt() ?? 0,
      totalUnits: items.fold(
        0,
        (sum, row) => sum + ((row as Map)['quantity'] as num? ?? 0).toInt(),
      ),
      fulfillmentMethod:
          json['fulfillment_method']?.toString() ?? 'buyer_pickup',
      status: OrderStatus.fromString(json['status']?.toString()),
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? ''),
      paymentDueAt: DateTime.tryParse(json['payment_due_at']?.toString() ?? ''),
      statusHistory: history
          .map(
            (row) => OrderStatusHistoryModel.fromJson(
              Map<String, dynamic>.from(row as Map),
            ),
          )
          .toList(),
      obligations: (obligations ?? const [])
          .map(
            (row) => PaymentObligationModel.fromJson(
              Map<String, dynamic>.from(row as Map),
            ),
          )
          .toList(),
      chatAccess: resolvedChatAccess == null
          ? null
          : OrderChatAccessModel.fromJson(resolvedChatAccess),
      allowedActions: (resolvedAllowedActions ?? const [])
          .map((action) => action.toString())
          .toList(),
      trackingEvents: (resolvedTrackingEvents ?? const [])
          .map(
            (row) => OrderTrackingEventModel.fromJson(
              Map<String, dynamic>.from(row as Map),
            ),
          )
          .toList(),
      paymentState:
          resolvedPaymentSummary?['state']?.toString() ?? 'not_issued',
      attention: resolvedAttention == null
          ? null
          : OrderAttentionModel.fromJson(resolvedAttention),
    );
  }

  factory B2BOrderModel.fromApiResponse(Map<String, dynamic> response) {
    final order = response['order'] is Map
        ? Map<String, dynamic>.from(response['order'] as Map)
        : response;
    Map<String, dynamic>? object(String key) => response[key] is Map
        ? Map<String, dynamic>.from(response[key] as Map)
        : null;
    return B2BOrderModel.fromJson(
      order,
      obligations:
          response['payment_obligations'] as List<dynamic>? ??
          order['payment_obligations'] as List<dynamic>?,
      chatAccess: object('chat_access'),
      allowedActions:
          response['allowed_actions'] as List<dynamic>? ??
          order['allowed_actions'] as List<dynamic>?,
      trackingEvents:
          response['tracking_events'] as List<dynamic>? ??
          order['tracking_events'] as List<dynamic>?,
      paymentSummary: object('payment_summary'),
      attention: object('attention'),
    );
  }
}
