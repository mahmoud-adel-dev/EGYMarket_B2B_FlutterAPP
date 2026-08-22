import 'package:flutter_test/flutter_test.dart';
import 'package:seals_app/features/orders/data/models/order_model.dart';

void main() {
  Map<String, dynamic> orderJson({String status = 'awaiting_payments'}) => {
    '_id': 'order-1',
    'order_number': 'ORD-TEST-1',
    'seller_organization_id': {
      '_id': 'seller-1',
      'display_name': 'تاجر الإلكترونيات',
    },
    'buyer_organization_id': {'_id': 'buyer-1', 'display_name': 'المشتري'},
    'shipper_organization_id': {
      '_id': 'shipper-1',
      'display_name': 'شركة الشحن',
    },
    'goods_subtotal_piasters': 100000,
    'shipping_cost_piasters': 5000,
    'platform_fee_piasters': 5000,
    'total_payable_piasters': 110000,
    'fulfillment_method': 'third_party_shipping',
    'status': status,
    'items': [
      {'quantity': 2},
    ],
    'status_history': [
      {
        'status': 'requested',
        'changed_by_role': 'Retailer',
        'timestamp': '2026-08-22T09:00:00.000Z',
      },
    ],
  };

  test('parses the server-owned chat fee gate and allowed actions', () {
    final order = B2BOrderModel.fromJson(
      orderJson(),
      chatAccess: {
        'allowed': false,
        'reason_code': 'PLATFORM_FEE_REQUIRED',
        'platform_fee_status': 'proof_submitted',
        'platform_fee_amount_piasters': 5000,
      },
      allowedActions: ['cancel'],
      paymentSummary: {'state': 'partial'},
    );

    expect(order.chatAccess?.allowed, isFalse);
    expect(order.chatAccess?.reasonCode, 'PLATFORM_FEE_REQUIRED');
    expect(order.chatAccess?.platformFeeStatus, 'proof_submitted');
    expect(order.chatAccess?.platformFeeAmountPiasters, 5000);
    expect(order.allowedActions, ['cancel']);
    expect(order.paymentState, 'partial');
  });

  test('parses append-only shipment checkpoints', () {
    final order = B2BOrderModel.fromJson(
      orderJson(status: 'in_transit'),
      chatAccess: {
        'allowed': true,
        'platform_fee_status': 'confirmed',
        'platform_fee_amount_piasters': 5000,
        'conversation_id': 'conversation-1',
      },
      allowedActions: ['add_tracking_checkpoint', 'confirm_delivery'],
      trackingEvents: [
        {
          '_id': 'track-1',
          'event_type': 'checkpoint',
          'location': 'مركز فرز القاهرة',
          'note': 'في الطريق إلى البحيرة',
          'occurred_at': '2026-08-22T10:00:00.000Z',
          'created_by_organization_id': {'display_name': 'شركة الشحن'},
        },
      ],
    );

    expect(order.status, OrderStatus.inTransit);
    expect(order.chatAccess?.allowed, isTrue);
    expect(order.chatAccess?.conversationId, 'conversation-1');
    expect(order.trackingEvents.single.location, 'مركز فرز القاهرة');
    expect(order.trackingEvents.single.organizationName, 'شركة الشحن');
  });

  test('does not mislabel a future backend state as requested', () {
    final order = B2BOrderModel.fromJson(orderJson(status: 'future_state'));
    expect(order.status, OrderStatus.unknown);
  });
}
