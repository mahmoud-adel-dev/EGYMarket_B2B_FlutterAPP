import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:easy_localization/easy_localization.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../../core/network/network_manager.dart';
import '../../../auth/data/models/auth_models.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
import '../../../auth/presentation/cubit/auth_state.dart';
import '../../data/models/order_model.dart';
import '../cubit/order_management_cubit.dart';
import '../cubit/order_management_state.dart';
import 'order_details_screen.dart';

class OrdersListScreen extends StatelessWidget {
  final UserRole userRole;
  final VoidCallback? onActivityChanged;

  const OrdersListScreen({
    super.key,
    required this.userRole,
    this.onActivityChanged,
  });

  @override
  Widget build(BuildContext context) {
    final network = ServiceLocator.network();
    return BlocProvider(
      create: (_) =>
          OrderManagementCubit(networkManager: network)..fetchOrders(),
      child: _OrdersView(
        userRole: userRole,
        network: network,
        onActivityChanged: onActivityChanged,
      ),
    );
  }
}

class _OrdersView extends StatefulWidget {
  final UserRole userRole;
  final INetworkManager network;
  final VoidCallback? onActivityChanged;

  const _OrdersView({
    required this.userRole,
    required this.network,
    this.onActivityChanged,
  });

  @override
  State<_OrdersView> createState() => _OrdersViewState();
}

class _OrdersViewState extends State<_OrdersView> {
  final TextEditingController _search = TextEditingController();
  OrderStatus? _filter;
  String? _lastError;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    await context.read<OrderManagementCubit>().fetchOrders(
      preserveExisting: true,
    );
    widget.onActivityChanged?.call();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(tr('order_list_title')),
        actions: [
          IconButton(
            onPressed: _refresh,
            icon: const Icon(Icons.refresh_rounded),
            tooltip: tr('order_list_refresh'),
          ),
        ],
      ),
      body: BlocConsumer<OrderManagementCubit, OrderManagementState>(
        listener: (context, state) {
          if (state is OrderManagementLoaded &&
              state.inlineError != null &&
              state.inlineError != _lastError) {
            _lastError = state.inlineError;
            ErrorHandler.showSecureSnackBar(
              context,
              state.inlineError!,
              isError: true,
            );
          }
        },
        builder: (context, state) {
          if (state is OrderManagementLoading ||
              state is OrderManagementInitial) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state is OrderManagementError) {
            return _OrdersError(message: state.message, onRetry: _refresh);
          }
          final loaded = state as OrderManagementLoaded;
          final query = _search.text.trim().toLowerCase();
          final orders = loaded.orders.where((order) {
            final matchesStatus = _filter == null || order.status == _filter;
            final matchesSearch =
                query.isEmpty ||
                order.orderNumber.toLowerCase().contains(query) ||
                order.sellerName.toLowerCase().contains(query) ||
                order.buyerName.toLowerCase().contains(query);
            return matchesStatus && matchesSearch;
          }).toList();
          return Stack(
            children: [
              RefreshIndicator(
                onRefresh: _refresh,
                child: CustomScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  slivers: [
                    SliverToBoxAdapter(child: _filters(loaded.orders)),
                    if (orders.isEmpty)
                      const SliverFillRemaining(
                        hasScrollBody: false,
                        child: _OrdersEmpty(),
                      )
                    else
                      SliverPadding(
                        padding: const EdgeInsets.fromLTRB(16, 6, 16, 110),
                        sliver: SliverList.separated(
                          itemCount: orders.length,
                          separatorBuilder: (_, _) =>
                              const SizedBox(height: 10),
                          itemBuilder: (context, index) =>
                              _orderCard(orders[index]),
                        ),
                      ),
                  ],
                ),
              ),
              if (loaded.isUpdating)
                const PositionedDirectional(
                  top: 0,
                  start: 0,
                  end: 0,
                  child: LinearProgressIndicator(minHeight: 2),
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _filters(List<B2BOrderModel> orders) {
    final counts = <OrderStatus, int>{};
    for (final order in orders) {
      counts.update(order.status, (value) => value + 1, ifAbsent: () => 1);
    }
    final filters = [
      null,
      OrderStatus.requested,
      OrderStatus.awaitingPayments,
      OrderStatus.preparing,
      OrderStatus.readyForPickup,
      OrderStatus.inTransit,
      OrderStatus.delivered,
      OrderStatus.completed,
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
      child: Column(
        children: [
          TextField(
            controller: _search,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: tr('order_list_search_label'),
              hintText: tr('order_list_search_hint'),
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: _search.text.isEmpty
                  ? null
                  : IconButton(
                      onPressed: () {
                        _search.clear();
                        setState(() {});
                      },
                      icon: const Icon(Icons.close_rounded),
                      tooltip: tr('order_list_clear_search'),
                    ),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 40,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: filters.length,
              separatorBuilder: (_, _) => const SizedBox(width: 7),
              itemBuilder: (context, index) {
                final status = filters[index];
                final selected = _filter == status;
                final label = status == null ? tr('all') : status.displayName;
                final count = status == null
                    ? orders.length
                    : counts[status] ?? 0;
                return FilterChip(
                  selected: selected,
                  avatar: status == null
                      ? const Icon(Icons.filter_list_rounded, size: 17)
                      : null,
                  label: Text('$label  $count'),
                  onSelected: (_) => setState(() => _filter = status),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _orderCard(B2BOrderModel order) {
    final auth = context.read<AuthCubit>().state;
    final user = auth is AuthenticatedState ? auth.user : null;
    final attention = order.attention?.requiresAction == true;
    return Semantics(
      button: true,
      label: attention
          ? tr(
              'order_card_semantics_attention',
              namedArgs: {
                'number': order.orderNumber,
                'status': order.status.displayName,
              },
            )
          : tr(
              'order_card_semantics',
              namedArgs: {
                'number': order.orderNumber,
                'status': order.status.displayName,
              },
            ),
      child: Card(
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: user == null ? null : () => _openOrder(order, user),
          child: Padding(
            padding: const EdgeInsets.all(15),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  backgroundColor: _statusColor(
                    order.status,
                  ).withValues(alpha: 0.12),
                  foregroundColor: _statusColor(order.status),
                  child: Icon(_statusIcon(order.status)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              order.orderNumber,
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 15,
                              ),
                            ),
                          ),
                          if (attention)
                            Chip(
                              visualDensity: VisualDensity.compact,
                              avatar: const Icon(
                                Icons.priority_high_rounded,
                                size: 16,
                              ),
                              label: Text(tr('order_requires_action')),
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text('${order.sellerName} ← ${order.buyerName}'),
                      const SizedBox(height: 9),
                      Wrap(
                        spacing: 7,
                        runSpacing: 7,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          _StatusPill(
                            label: order.status.displayName,
                            color: _statusColor(order.status),
                          ),
                          if (order.paymentState != 'not_issued')
                            _StatusPill(
                              label: _paymentStateName(order.paymentState),
                              color: const Color(0xFF7C3AED),
                              icon: Icons.payments_outlined,
                            ),
                          if (widget.userRole == UserRole.retailer &&
                              order.chatAccess?.allowed == false)
                            _StatusPill(
                              label: tr('order_chat_locked'),
                              color: const Color(0xFFB45309),
                              icon: Icons.lock_outline_rounded,
                            ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Text(
                            '${order.totalAmount.toStringAsFixed(2)} ${tr('currency_egp')}',
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF0F766E),
                            ),
                          ),
                          const Spacer(),
                          TextButton.icon(
                            onPressed: user == null
                                ? null
                                : () => _openOrder(order, user),
                            icon: const Icon(
                              Icons.visibility_outlined,
                              size: 18,
                            ),
                            label: Text(tr('order_details')),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _openOrder(B2BOrderModel order, AuthUserModel user) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => OrderDetailsScreen(
          orderId: order.id,
          currentUserRole: widget.userRole,
          currentOrganizationId: user.organizationId ?? '',
          organizationMemberRole: user.organizationMemberRole,
          networkManager: widget.network,
          onOrderChanged: (updated) {
            context.read<OrderManagementCubit>().upsertOrder(updated);
            widget.onActivityChanged?.call();
          },
        ),
      ),
    );
    widget.onActivityChanged?.call();
  }

  String _paymentStateName(String state) => switch (state) {
    'pending' => tr('payment_pending'),
    'partial' => tr('payment_partial'),
    'paid' => tr('payment_paid'),
    _ => state,
  };

  Color _statusColor(OrderStatus status) => switch (status) {
    OrderStatus.completed => const Color(0xFF15803D),
    OrderStatus.rejected || OrderStatus.canceled => const Color(0xFFB91C1C),
    OrderStatus.disputed => const Color(0xFFB45309),
    OrderStatus.inTransit || OrderStatus.delivered => const Color(0xFF0369A1),
    OrderStatus.awaitingPayments => const Color(0xFF7C3AED),
    _ => const Color(0xFF0F766E),
  };

  IconData _statusIcon(OrderStatus status) => switch (status) {
    OrderStatus.requested => Icons.mark_email_unread_outlined,
    OrderStatus.awaitingPayments => Icons.account_balance_wallet_outlined,
    OrderStatus.preparing => Icons.inventory_2_outlined,
    OrderStatus.readyForPickup => Icons.local_shipping_outlined,
    OrderStatus.inTransit => Icons.route_outlined,
    OrderStatus.delivered => Icons.move_to_inbox_outlined,
    OrderStatus.completed => Icons.task_alt_rounded,
    OrderStatus.rejected || OrderStatus.canceled => Icons.cancel_outlined,
    OrderStatus.disputed => Icons.gavel_outlined,
    OrderStatus.unknown => Icons.help_outline_rounded,
  };
}

class _StatusPill extends StatelessWidget {
  final String label;
  final Color color;
  final IconData? icon;
  const _StatusPill({required this.label, required this.color, this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 15, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _OrdersEmpty extends StatelessWidget {
  const _OrdersEmpty();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.inventory_2_outlined, size: 62, color: Colors.black26),
          const SizedBox(height: 12),
          Text(tr('order_no_matching')),
        ],
      ),
    );
  }
}

class _OrdersError extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _OrdersError({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline_rounded, size: 52),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded),
              label: Text(tr('retry')),
            ),
          ],
        ),
      ),
    );
  }
}
