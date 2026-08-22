import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../../core/network/network_manager.dart';
import '../../data/models/cart_item_model.dart';
import 'cart_state.dart';

class CartCubit extends Cubit<CartState> {
  final INetworkManager _network;
  CartCubit({required INetworkManager networkManager})
    : _network = networkManager,
      super(CartInitial());

  Future<void> loadCart() async {
    emit(CartLoading());
    try {
      final response = await _network.get<Map<String, dynamic>>('/cart');
      final cart = response['cart'] as Map<String, dynamic>? ?? {};
      final rows = cart['items'] as List<dynamic>? ?? const [];
      emit(
        CartLoaded(
          items: rows
              .map(
                (row) =>
                    CartItemModel.fromCartJson(row as Map<String, dynamic>),
              )
              .toList(),
        ),
      );
    } catch (error) {
      emit(CartError(ErrorHandler.getUserFriendlyMessage(error)));
    }
  }

  Future<void> setQuantity(CartItemModel item, int quantity) async {
    if (quantity < item.minOrderQuantity) return;
    try {
      await _network.patch<Map<String, dynamic>>(
        '/cart',
        data: {'product_id': item.productId, 'quantity': quantity},
      );
      await loadCart();
    } catch (error) {
      emit(CartError(ErrorHandler.getUserFriendlyMessage(error)));
    }
  }

  Future<void> incrementQuantity(String itemId, {int step = 1}) async {
    final current = state;
    if (current is! CartLoaded) return;
    final item = current.items.firstWhere((entry) => entry.id == itemId);
    await setQuantity(item, item.quantity + step);
  }

  Future<bool> decrementQuantity(String itemId, {int step = 1}) async {
    final current = state;
    if (current is! CartLoaded) return false;
    final item = current.items.firstWhere((entry) => entry.id == itemId);
    if (item.quantity - step < item.minOrderQuantity) return false;
    await setQuantity(item, item.quantity - step);
    return true;
  }

  Future<void> removeItem(String itemId) async {
    try {
      await _network.delete<Map<String, dynamic>>(
        '/cart',
        data: {'product_id': itemId},
      );
      await loadCart();
    } catch (error) {
      emit(CartError(ErrorHandler.getUserFriendlyMessage(error)));
    }
  }

  void clearCart() => emit(CartLoaded(items: const []));
}
