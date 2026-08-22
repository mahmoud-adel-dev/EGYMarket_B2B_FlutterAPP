import 'package:flutter/foundation.dart';
import '../../data/models/shipper_model.dart';

@immutable
abstract class CheckoutState {}

class CheckoutInitial extends CheckoutState {}

class CheckoutLoading extends CheckoutState {}

class CheckoutLoaded extends CheckoutState {
  final String originGovernorate;
  final String destinationGovernorate;
  final List<ShipperModel> availableShippers;
  final ShipperModel? selectedShipper;
  final FulfillmentMethod fulfillmentMethod;
  final bool isSubmitting;

  CheckoutLoaded({
    required this.originGovernorate,
    required this.destinationGovernorate,
    required this.availableShippers,
    this.selectedShipper,
    this.fulfillmentMethod = FulfillmentMethod.buyerPickup,
    this.isSubmitting = false,
  });

  CheckoutLoaded copyWith({
    String? destinationGovernorate,
    List<ShipperModel>? availableShippers,
    ShipperModel? selectedShipper,
    FulfillmentMethod? fulfillmentMethod,
    bool? isSubmitting,
  }) => CheckoutLoaded(
    originGovernorate: originGovernorate,
    destinationGovernorate:
        destinationGovernorate ?? this.destinationGovernorate,
    availableShippers: availableShippers ?? this.availableShippers,
    selectedShipper: selectedShipper ?? this.selectedShipper,
    fulfillmentMethod: fulfillmentMethod ?? this.fulfillmentMethod,
    isSubmitting: isSubmitting ?? this.isSubmitting,
  );
}

class CheckoutSuccess extends CheckoutState {
  final String orderId;
  final String orderNumber;
  CheckoutSuccess({required this.orderId, required this.orderNumber});
}

class CheckoutError extends CheckoutState {
  final String message;
  CheckoutError(this.message);
}
