import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../../core/network/network_manager.dart';
import '../../data/models/order_model.dart';
import 'order_management_state.dart';

class OrderManagementCubit extends Cubit<OrderManagementState> {
  final INetworkManager _network;
  OrderManagementCubit({required INetworkManager networkManager})
    : _network = networkManager,
      super(OrderManagementInitial());

  void _emitIfOpen(OrderManagementState nextState) {
    if (!isClosed) emit(nextState);
  }

  Future<void> fetchOrders({bool preserveExisting = false}) async {
    if (isClosed) return;
    final previous = state;
    if (preserveExisting && previous is OrderManagementLoaded) {
      _emitIfOpen(previous.copyWith(isUpdating: true, clearError: true));
    } else {
      _emitIfOpen(OrderManagementLoading());
    }
    try {
      final response = await _network.get<Map<String, dynamic>>('/orders');
      if (isClosed) return;
      final rows = response['orders'] as List<dynamic>? ?? const [];
      _emitIfOpen(
        OrderManagementLoaded(
          orders: rows
              .map((row) => B2BOrderModel.fromJson(row as Map<String, dynamic>))
              .toList(),
        ),
      );
    } catch (error) {
      if (isClosed) return;
      final message = ErrorHandler.getUserFriendlyMessage(error);
      final latest = state;
      if (latest is OrderManagementLoaded) {
        _emitIfOpen(latest.copyWith(isUpdating: false, inlineError: message));
      } else {
        _emitIfOpen(OrderManagementError(message));
      }
    }
  }

  Future<void> performAction({
    required String orderId,
    required String action,
    String? note,
  }) async {
    if (isClosed) return;
    final current = state;
    if (current is! OrderManagementLoaded) return;
    _emitIfOpen(current.copyWith(isUpdating: true));
    try {
      final response = await _network.patch<Map<String, dynamic>>(
        '/orders/$orderId/status',
        data: {'action': action, 'note': ?note},
      );
      if (isClosed) return;
      final updated = B2BOrderModel.fromApiResponse(response);
      final latest = state;
      if (latest is! OrderManagementLoaded) return;
      final exists = latest.orders.any((order) => order.id == updated.id);
      _emitIfOpen(
        latest.copyWith(
          orders: exists
              ? latest.orders
                    .map((order) => order.id == updated.id ? updated : order)
                    .toList()
              : [updated, ...latest.orders],
          isUpdating: false,
          clearError: true,
        ),
      );
    } catch (error) {
      if (isClosed) return;
      final latest = state;
      final message = ErrorHandler.getUserFriendlyMessage(error);
      if (latest is OrderManagementLoaded) {
        _emitIfOpen(latest.copyWith(isUpdating: false, inlineError: message));
      } else {
        _emitIfOpen(OrderManagementError(message));
      }
    }
  }

  void upsertOrder(B2BOrderModel order) {
    final current = state;
    if (isClosed || current is! OrderManagementLoaded) return;
    final exists = current.orders.any((item) => item.id == order.id);
    _emitIfOpen(
      current.copyWith(
        orders: exists
            ? current.orders
                  .map((item) => item.id == order.id ? order : item)
                  .toList()
            : [order, ...current.orders],
        clearError: true,
      ),
    );
  }
}
