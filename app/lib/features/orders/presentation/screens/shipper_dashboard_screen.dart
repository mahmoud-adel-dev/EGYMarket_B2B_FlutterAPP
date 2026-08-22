import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../../core/network/network_manager.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../../core/widgets/error_retry_view.dart';
import '../../../auth/data/models/auth_models.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
import '../../../auth/presentation/cubit/auth_state.dart';
import '../../data/models/order_model.dart';
import 'orders_list_screen.dart';
import 'order_details_screen.dart';

/// Shipper operations dashboard: live shipment pipeline (awaiting pickup →
/// in transit → delivered) with one-tap status actions and earnings summary.
///
/// Replaces the former placeholder that simply wrapped [OrdersListScreen].
class ShipperDashboardScreen extends StatefulWidget {
  final VoidCallback? onActivityChanged;

  const ShipperDashboardScreen({super.key, this.onActivityChanged});

  @override
  State<ShipperDashboardScreen> createState() => _ShipperDashboardScreenState();
}

class _ShipperDashboardScreenState extends State<ShipperDashboardScreen> {
  late final INetworkManager _network;
  bool _isLoading = true;
  bool _isRefreshing = false;
  String? _pendingOrderId;
  String? _error;
  List<B2BOrderModel> _orders = const [];

  List<B2BOrderModel> get _awaitingPickup => _orders
      .where(
        (o) =>
            o.fulfillmentMethod == 'third_party_shipping' &&
            o.status == OrderStatus.readyForPickup,
      )
      .toList();

  List<B2BOrderModel> get _inTransit =>
      _orders.where((o) => o.status == OrderStatus.inTransit).toList();

  List<B2BOrderModel> get _delivered =>
      _orders.where((o) => o.status == OrderStatus.delivered).toList();

  int get _pendingShippingIncomePiasters {
    return [
      ..._inTransit,
      ..._delivered,
    ].fold(0, (sum, o) => sum + o.shippingCostPiasters);
  }

  @override
  void initState() {
    super.initState();
    _network = ServiceLocator.network();
    _load();
  }

  Future<void> _load({bool silent = false}) async {
    if (silent && _orders.isNotEmpty) {
      if (_isRefreshing) return;
      _isRefreshing = true;
    } else {
      setState(() {
        _isLoading = true;
        _error = null;
      });
    }
    try {
      final response = await _network.get<Map<String, dynamic>>(
        '/orders',
        queryParameters: {'limit': '100'},
      );
      final rows = response['orders'] as List<dynamic>? ?? const [];
      if (!mounted) return;
      setState(() {
        _orders = rows
            .map((row) => B2BOrderModel.fromJson(row as Map<String, dynamic>))
            .where((o) => o.fulfillmentMethod == 'third_party_shipping')
            .toList();
        _isLoading = false;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error ??= ErrorHandler.getUserFriendlyMessage(error);
        _isLoading = false;
      });
    } finally {
      _isRefreshing = false;
    }
  }

  void _applyUpdate(B2BOrderModel updated) {
    final index = _orders.indexWhere((order) => order.id == updated.id);
    if (!mounted) return;
    setState(() {
      if (index >= 0) {
        final orders = [..._orders];
        orders[index] = updated;
        _orders = orders;
      } else {
        _orders = [updated, ..._orders];
      }
    });
  }

  Future<void> _advance(B2BOrderModel order) async {
    if (_pendingOrderId != null) return;
    final action = order.status == OrderStatus.readyForPickup
        ? 'confirm_pickup'
        : 'confirm_delivery';
    setState(() {
      _pendingOrderId = order.id;
      _error = null;
    });
    try {
      final response = await _network.patch<Map<String, dynamic>>(
        '/orders/${order.id}/status',
        data: {'action': action},
      );
      final updated = B2BOrderModel.fromApiResponse(response);
      if (!mounted) return;
      _applyUpdate(updated);
      widget.onActivityChanged?.call();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            action == 'confirm_pickup'
                ? 'تم استلام الطلبية وبدء الشحن'
                : 'تم تأكيد تسليم الشحنة',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ErrorHandler.getUserFriendlyMessage(error)),
          backgroundColor: AppColors.error,
        ),
      );
    } finally {
      if (mounted) setState(() => _pendingOrderId = null);
    }
  }

  void _openOrder(B2BOrderModel order) {
    final authState = context.read<AuthCubit>().state;
    final user = authState is AuthenticatedState ? authState.user : null;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => OrderDetailsScreen(
          orderId: order.id,
          currentUserRole: UserRole.shipper,
          currentOrganizationId: user?.organizationId ?? '',
          organizationMemberRole: user?.organizationMemberRole,
          networkManager: _network,
          onOrderChanged: (updated) => _applyUpdate(updated),
        ),
      ),
    ).then((_) {
      widget.onActivityChanged?.call();
      unawaited(_load(silent: true));
    });
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () => _load(silent: true),
      child: _isLoading
          ? ListView(
              children: const [
                SizedBox(height: 120),
                Center(child: CircularProgressIndicator()),
              ],
            )
          : _error != null && _orders.isEmpty
          ? ListView(
              children: [
                const SizedBox(height: 120),
                ErrorRetryView(message: _error!, onRetry: _load),
              ],
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _StatCard(
                        label: 'بانتظار الاستلام',
                        value: '${_awaitingPickup.length}',
                        icon: Icons.local_shipping_outlined,
                        color: AppColors.warning,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _StatCard(
                        label: 'في الطريق',
                        value: '${_inTransit.length}',
                        icon: Icons.route_rounded,
                        color: AppColors.primary,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _StatCard(
                        label: 'تم التسليم',
                        value: '${_delivered.length}',
                        icon: Icons.task_alt_rounded,
                        color: AppColors.success,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.payments_outlined,
                          color: AppColors.primary,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'أجور شحن قيد التحصيل',
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                              Text(
                                PriceFormatter.egp(
                                  _pendingShippingIncomePiasters,
                                ),
                                style: Theme.of(context).textTheme.titleMedium
                                    ?.copyWith(
                                      fontWeight: FontWeight.w800,
                                      color: AppColors.primary,
                                    ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                if (_awaitingPickup.isNotEmpty) ...[
                  _SectionHeader(title: 'جاهزة للاستلام من التاجر'),
                  ..._awaitingPickup.map(
                    (order) => _ShipmentTile(
                      order: order,
                      isPending: _pendingOrderId == order.id,
                      onOpen: () => _openOrder(order),
                      onAdvance: () => _advance(order),
                    ),
                  ),
                ],
                if (_inTransit.isNotEmpty) ...[
                  _SectionHeader(title: 'قيد النقل'),
                  ..._inTransit.map(
                    (order) => _ShipmentTile(
                      order: order,
                      isPending: _pendingOrderId == order.id,
                      onOpen: () => _openOrder(order),
                      onAdvance: () => _advance(order),
                    ),
                  ),
                ],
                if (_delivered.isNotEmpty) ...[
                  _SectionHeader(title: 'مسلّمة — بانتظار تأكيد المشتري'),
                  ..._delivered.map(
                    (order) => _ShipmentTile(
                      order: order,
                      onOpen: () => _openOrder(order),
                      onAdvance: null,
                    ),
                  ),
                ],
                if (_orders.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: 60),
                    child: ErrorRetryView(
                      message: 'لا توجد شحنات مسندة حاليًا',
                      icon: Icons.inbox_outlined,
                      isEmptyState: true,
                    ),
                  ),
                const SizedBox(height: 24),
                OutlinedButton.icon(
                  onPressed: () =>
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => const OrdersListScreen(
                            userRole: UserRole.shipper,
                          ),
                        ),
                      ).then((_) {
                        widget.onActivityChanged?.call();
                        _load(silent: true);
                      }),
                  icon: const Icon(Icons.list_alt_rounded),
                  label: const Text('كل الطلبات'),
                ),
              ],
            ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 10),
      child: Align(
        alignment: AlignmentDirectional.centerStart,
        child: Text(
          title,
          style: Theme.of(
            context,
          ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _StatCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
        child: Column(
          children: [
            Icon(icon, color: color, size: 26),
            const SizedBox(height: 6),
            Text(
              value,
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AppColors.textSecondary),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _ShipmentTile extends StatelessWidget {
  final B2BOrderModel order;
  final VoidCallback onOpen;
  final VoidCallback? onAdvance;
  final bool isPending;

  const _ShipmentTile({
    required this.order,
    required this.onOpen,
    this.onAdvance,
    this.isPending = false,
  });

  @override
  Widget build(BuildContext context) {
    final canAdvance =
        order.status == OrderStatus.readyForPickup ||
        order.status == OrderStatus.inTransit;
    final attention = order.attention?.requiresAction == true;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        onTap: onOpen,
        leading: CircleAvatar(
          backgroundColor: (attention ? AppColors.warning : AppColors.primary)
              .withValues(alpha: 0.12),
          foregroundColor: attention ? AppColors.warning : AppColors.primary,
          child: Icon(
            order.status == OrderStatus.delivered
                ? Icons.task_alt_rounded
                : Icons.local_shipping_outlined,
            size: 20,
          ),
        ),
        title: Row(
          children: [
            Expanded(
              child: Text(
                order.orderNumber,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
            if (attention)
              Tooltip(
                message: 'يتطلب إجراء',
                child: Icon(
                  Icons.priority_high_rounded,
                  size: 17,
                  color: AppColors.warning,
                ),
              ),
          ],
        ),
        subtitle: Text(
          '${order.sellerName} → ${order.buyerName}\n'
          'شحن: ${PriceFormatter.egp(order.shippingCostPiasters)}',
        ),
        isThreeLine: true,
        trailing: canAdvance && onAdvance != null
            ? FilledButton.icon(
                onPressed: isPending ? null : onAdvance,
                icon: isPending
                    ? const SizedBox(
                        width: 17,
                        height: 17,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Icon(
                        order.status == OrderStatus.readyForPickup
                            ? Icons.inventory_rounded
                            : Icons.local_shipping_rounded,
                        size: 18,
                      ),
                label: Text(
                  order.status == OrderStatus.readyForPickup
                      ? 'بدء الشحن'
                      : 'تسليم',
                ),
              )
            : const Icon(Icons.chevron_right_rounded),
      ),
    );
  }
}
