import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../../core/network/network_manager.dart';
import '../../../cart/data/models/cart_item_model.dart';
import '../../data/models/shipper_model.dart';
import 'checkout_state.dart';

class CheckoutCubit extends Cubit<CheckoutState> {
  final INetworkManager _network;
  CheckoutCubit({required INetworkManager networkManager})
    : _network = networkManager,
      super(CheckoutInitial());

  Future<void> initializeCheckout({
    required String origin,
    String destination = 'Cairo',
  }) async {
    emit(
      CheckoutLoaded(
        originGovernorate: origin,
        destinationGovernorate: destination,
        availableShippers: const [],
      ),
    );
  }

  Future<void> setFulfillment(FulfillmentMethod method) async {
    final current = state;
    if (current is! CheckoutLoaded) return;
    emit(current.copyWith(fulfillmentMethod: method));
    if (method == FulfillmentMethod.thirdPartyShipping) {
      await fetchShippers(destination: current.destinationGovernorate);
    }
  }

  Future<void> fetchShippers({required String destination}) async {
    final current = state;
    if (current is! CheckoutLoaded) return;
    try {
      final response = await _network.get<Map<String, dynamic>>(
        '/shippers',
        queryParameters: {'from': current.originGovernorate, 'to': destination},
      );
      final rows = response['shippers'] as List<dynamic>? ?? const [];
      final shippers = rows
          .map((row) => ShipperModel.fromJson(row as Map<String, dynamic>))
          .toList();
      emit(
        current.copyWith(
          destinationGovernorate: destination,
          availableShippers: shippers,
          selectedShipper: shippers.isNotEmpty ? shippers.first : null,
        ),
      );
    } catch (error) {
      emit(CheckoutError(ErrorHandler.getUserFriendlyMessage(error)));
    }
  }

  void selectShipper(ShipperModel shipper) {
    final current = state;
    if (current is CheckoutLoaded) {
      emit(current.copyWith(selectedShipper: shipper));
    }
  }

  Future<void> completeOrder({
    required List<CartItemModel> cartItems,
    required String address,
    required String contactName,
    required String phone,
  }) async {
    final current = state;
    if (current is! CheckoutLoaded) return;
    if (current.fulfillmentMethod == FulfillmentMethod.thirdPartyShipping &&
        current.selectedShipper == null) {
      emit(CheckoutError('لا توجد شركة شحن متاحة لهذا المسار'));
      return;
    }
    emit(current.copyWith(isSubmitting: true));
    try {
      final shipping =
          current.fulfillmentMethod == FulfillmentMethod.thirdPartyShipping;
      final response = await _network.post<Map<String, dynamic>>(
        '/orders',
        data: {
          'items': cartItems
              .map(
                (item) => {
                  'product_id': item.productId,
                  'quantity': item.quantity,
                },
              )
              .toList(),
          'fulfillment_method': shipping
              ? 'third_party_shipping'
              : 'buyer_pickup',
          if (shipping) 'shipping_rate_id': current.selectedShipper!.rateId,
          if (shipping)
            'shipping_address': {
              'governorate': current.destinationGovernorate,
              'address': address,
              'contact_name': contactName,
              'phone': phone,
            },
        },
      );
      final order = response['order'] as Map<String, dynamic>? ?? {};
      emit(
        CheckoutSuccess(
          orderId: order['_id']?.toString() ?? '',
          orderNumber: order['order_number']?.toString() ?? '',
        ),
      );
    } catch (error) {
      emit(CheckoutError(ErrorHandler.getUserFriendlyMessage(error)));
    }
  }
}
