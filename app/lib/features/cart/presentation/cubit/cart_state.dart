import 'package:flutter/foundation.dart';
import '../../data/models/cart_item_model.dart';

@immutable
abstract class CartState {}

class CartInitial extends CartState {}

class CartLoading extends CartState {}

class CartLoaded extends CartState {
  final List<CartItemModel> items;

  CartLoaded({required this.items});

  double get totalAmount => items.fold(0.0, (sum, item) => sum + item.subtotal);
  int get totalPiasters =>
      items.fold(0, (sum, item) => sum + item.subtotalPiasters);
  int get itemCount => items.fold(0, (sum, item) => sum + item.quantity);
  bool get hasMultipleSellers =>
      items.map((item) => item.sellerOrganizationId).toSet().length > 1;
}

class CartError extends CartState {
  final String message;
  CartError(this.message);
}
