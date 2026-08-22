import 'package:flutter/foundation.dart';
import '../../data/models/order_model.dart';

@immutable
abstract class OrderManagementState {}

class OrderManagementInitial extends OrderManagementState {}

class OrderManagementLoading extends OrderManagementState {}

class OrderManagementLoaded extends OrderManagementState {
  final List<B2BOrderModel> orders;
  final bool isUpdating;
  final String? inlineError;

  OrderManagementLoaded({
    required this.orders,
    this.isUpdating = false,
    this.inlineError,
  });

  OrderManagementLoaded copyWith({
    List<B2BOrderModel>? orders,
    bool? isUpdating,
    String? inlineError,
    bool clearError = false,
  }) {
    return OrderManagementLoaded(
      orders: orders ?? this.orders,
      isUpdating: isUpdating ?? this.isUpdating,
      inlineError: clearError ? null : (inlineError ?? this.inlineError),
    );
  }
}

class OrderManagementError extends OrderManagementState {
  final String message;
  OrderManagementError(this.message);
}
