import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:easy_localization/easy_localization.dart';

import '../../../../core/errors/error_handler.dart';
import '../../../../core/network/network_manager.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../auth/data/models/auth_models.dart';
import '../../../chat/presentation/screens/conversations_screen.dart';
import '../../data/models/order_model.dart';

class OrderDetailsScreen extends StatefulWidget {
  final String orderId;
  final UserRole currentUserRole;
  final String currentOrganizationId;
  final String? organizationMemberRole;
  final INetworkManager networkManager;
  final void Function(B2BOrderModel updated)? onOrderChanged;

  const OrderDetailsScreen({
    super.key,
    required this.orderId,
    required this.currentUserRole,
    required this.currentOrganizationId,
    required this.networkManager,
    this.organizationMemberRole,
    this.onOrderChanged,
  });

  @override
  State<OrderDetailsScreen> createState() => _OrderDetailsScreenState();
}

class _OrderDetailsScreenState extends State<OrderDetailsScreen> {
  B2BOrderModel? _order;
  String? _error;
  bool _loading = true;
  bool _working = false;
  bool _openingChat = false;
  String? _pendingAction;

  bool get _busy => _working || _pendingAction != null;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool announceFailure = false}) async {
    final hasContent = _order != null;
    if (!hasContent && mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final response = await widget.networkManager.get<Map<String, dynamic>>(
        '/orders/${widget.orderId}',
      );
      final orderJson = response['order'] as Map<String, dynamic>?;
      if (orderJson == null) {
        throw StateError('Order payload is missing');
      }
      final order = B2BOrderModel.fromJson(
        orderJson,
        obligations:
            response['payment_obligations'] as List<dynamic>? ?? const [],
        chatAccess: response['chat_access'] is Map
            ? Map<String, dynamic>.from(response['chat_access'] as Map)
            : null,
        allowedActions:
            response['allowed_actions'] as List<dynamic>? ?? const [],
        trackingEvents:
            response['tracking_events'] as List<dynamic>? ?? const [],
        paymentSummary: response['payment_summary'] is Map
            ? Map<String, dynamic>.from(response['payment_summary'] as Map)
            : null,
        attention: response['attention'] is Map
            ? Map<String, dynamic>.from(response['attention'] as Map)
            : null,
      );
      if (!mounted) return;
      setState(() {
        _order = order;
        _error = null;
        _loading = false;
      });
      widget.onOrderChanged?.call(order);
    } catch (error) {
      if (!mounted) return;
      final message = ErrorHandler.getUserFriendlyMessage(error);
      if (_order == null) {
        setState(() {
          _error = message;
          _loading = false;
        });
      } else if (announceFailure) {
        ErrorHandler.showSecureSnackBar(context, message, isError: true);
      }
    }
  }

  Future<void> _action(String action, {String? note}) async {
    setState(() => _pendingAction = action);
    try {
      final response = await widget.networkManager.patch<Map<String, dynamic>>(
        '/orders/${widget.orderId}/status',
        data: {'action': action, 'note': ?note},
      );
      final updated = B2BOrderModel.fromApiResponse(response);
      if (!mounted) return;
      setState(() => _order = updated);
      widget.onOrderChanged?.call(updated);
      ErrorHandler.showSecureSnackBar(
        context,
        _actionSuccessMessage(action),
        isError: false,
      );
    } catch (error) {
      if (!mounted) return;
      ErrorHandler.showSecureSnackBar(
        context,
        ErrorHandler.getUserFriendlyMessage(error),
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _pendingAction = null);
    }
  }

  Future<void> _openChat() async {
    final access = _order?.chatAccess;
    if (access?.allowed != true) {
      final amount =
          (access?.platformFeeAmountPiasters ??
              _order?.platformFeePiasters ??
              5000) /
          100;
      ErrorHandler.showSecureSnackBar(
        context,
        tr(
          'order_chat_fee_locked',
          namedArgs: {'amount': amount.toStringAsFixed(2)},
        ),
        isError: true,
      );
      return;
    }
    setState(() => _openingChat = true);
    try {
      var id = access?.conversationId;
      if (id == null || id.isEmpty) {
        final response = await widget.networkManager.post<Map<String, dynamic>>(
          '/conversations',
          data: {'order_id': widget.orderId},
        );
        final conversation = response['conversation'] as Map<String, dynamic>;
        id = (conversation['_id'] ?? conversation['id']).toString();
      }
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ConversationChatScreen(
            conversationId: id!,
            title: tr('order_chat_title', namedArgs: {'number': _order?.orderNumber ?? ''}),
            currentOrganizationId: widget.currentOrganizationId,
            networkManager: widget.networkManager,
          ),
        ),
      );
      if (mounted) await _load();
    } catch (error) {
      if (mounted) {
        ErrorHandler.showSecureSnackBar(
          context,
          ErrorHandler.getUserFriendlyMessage(error),
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _openingChat = false);
    }
  }

  Future<String?> _uploadProof() async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 80,
      maxWidth: 1800,
    );
    if (picked == null) return null;
    final bytes = await picked.readAsBytes();
    final mime =
        picked.mimeType ??
        (picked.name.toLowerCase().endsWith('.png')
            ? 'image/png'
            : 'image/jpeg');
    final response = await widget.networkManager.post<Map<String, dynamic>>(
      '/upload',
      data: {
        'fileData': 'data:$mime;base64,${base64Encode(bytes)}',
        'fileType': 'image',
        'mimeType': mime,
      },
    );
    return (response['media'] as Map<String, dynamic>?)?['url']?.toString();
  }

  Future<void> _submitProof(PaymentObligationModel obligation) async {
    if (obligation.accounts.isEmpty) return;
    final reference = TextEditingController();
    String method =
        obligation.accounts.first['method']?.toString() ?? 'instapay';
    final approved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(tr('payment_submit_proof_title')),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: method,
                items: obligation.accounts
                    .map(
                      (account) => DropdownMenuItem(
                        value: account['method']?.toString(),
                        child: Text(
                          '${account['label']} — ${account['account_reference']}',
                        ),
                      ),
                    )
                    .toList(),
                onChanged: (value) =>
                    setDialogState(() => method = value ?? method),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: reference,
                decoration: InputDecoration(
                  labelText: tr('payment_reference_label'),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                tr('payment_proof_instruction'),
                style: const TextStyle(fontSize: 12),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: Text(tr('cancel')),
            ),
            ElevatedButton.icon(
              onPressed: () => Navigator.pop(context, true),
              icon: const Icon(Icons.upload_file_outlined, size: 18),
              label: Text(tr('payment_choose_receipt')),
            ),
          ],
        ),
      ),
    );
    try {
      if (approved != true) return;
      if (reference.text.trim().length < 3) {
        if (mounted) {
          ErrorHandler.showSecureSnackBar(
            context,
            tr('payment_reference_required'),
            isError: true,
          );
        }
        return;
      }
      setState(() => _working = true);
      final proofUrl = await _uploadProof();
      if (proofUrl == null) return;
      await widget.networkManager.post<Map<String, dynamic>>(
        '/orders/${widget.orderId}/payments/${obligation.id}/proof',
        data: {
          'payment_method': method,
          'sender_reference': reference.text.trim(),
          'proof_url': proofUrl,
        },
      );
      if (mounted) {
        ErrorHandler.showSecureSnackBar(
          context,
          tr('payment_proof_submitted'),
          isError: false,
        );
      }
      await _load(announceFailure: true);
    } catch (error) {
      if (mounted) {
        ErrorHandler.showSecureSnackBar(
          context,
          ErrorHandler.getUserFriendlyMessage(error),
          isError: true,
        );
      }
    } finally {
      reference.dispose();
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _reviewPayment(
    PaymentObligationModel obligation,
    String decision,
  ) async {
    setState(() => _working = true);
    try {
      await widget.networkManager.post<Map<String, dynamic>>(
        '/orders/${widget.orderId}/payments/${obligation.id}/review',
        data: {
          'decision': decision,
          if (decision == 'reject')
            'rejection_reason': 'بيانات التحويل غير مطابقة',
        },
      );
      if (mounted) {
        ErrorHandler.showSecureSnackBar(
          context,
          decision == 'confirm' ? tr('payment_confirmed') : tr('payment_proof_rejected'),
          isError: false,
        );
      }
      await _load(announceFailure: true);
    } catch (error) {
      if (mounted) {
        ErrorHandler.showSecureSnackBar(
          context,
          ErrorHandler.getUserFriendlyMessage(error),
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _addTrackingEvent() async {
    final location = TextEditingController();
    final note = TextEditingController();
    var eventType = 'checkpoint';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(tr('tracking_add_title')),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: eventType,
                items: [
                  DropdownMenuItem(
                    value: 'checkpoint',
                    child: Text(tr('tracking_type_checkpoint')),
                  ),
                  DropdownMenuItem(
                    value: 'out_for_delivery',
                    child: Text(tr('tracking_type_out_for_delivery')),
                  ),
                  DropdownMenuItem(
                    value: 'delivery_attempt',
                    child: Text(tr('tracking_type_delivery_attempt')),
                  ),
                  DropdownMenuItem(
                    value: 'exception',
                    child: Text(tr('tracking_type_exception')),
                  ),
                ],
                onChanged: (value) =>
                    setDialogState(() => eventType = value ?? eventType),
                decoration: InputDecoration(labelText: tr('tracking_type_label')),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: location,
                decoration: InputDecoration(
                  labelText: tr('tracking_location_label'),
                  prefixIcon: const Icon(Icons.location_on_outlined),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: note,
                maxLines: 3,
                decoration: InputDecoration(labelText: tr('tracking_note_label')),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: Text(tr('cancel')),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: Text(tr('tracking_add')),
            ),
          ],
        ),
      ),
    );
    final locationText = location.text.trim();
    final noteText = note.text.trim();
    location.dispose();
    note.dispose();
    if (confirmed != true || locationText.length < 2) return;
    setState(() => _working = true);
    try {
      await widget.networkManager.post<Map<String, dynamic>>(
        '/orders/${widget.orderId}/tracking',
        data: {
          'event_type': eventType,
          'location': locationText,
          'client_event_id': 'track-${DateTime.now().microsecondsSinceEpoch}',
          if (noteText.isNotEmpty) 'note': noteText,
        },
      );
      if (mounted) {
        ErrorHandler.showSecureSnackBar(
          context,
          tr('tracking_added'),
          isError: false,
        );
      }
      await _load(announceFailure: true);
    } catch (error) {
      if (mounted) {
        ErrorHandler.showSecureSnackBar(
          context,
          ErrorHandler.getUserFriendlyMessage(error),
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(tr('order_details')),
        actions: [
          IconButton(
            onPressed: _busy ? null : () => _load(announceFailure: true),
            tooltip: tr('order_details_refresh'),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? _buildErrorView()
          : RefreshIndicator(
              onRefresh: () => _load(announceFailure: true),
              child: _buildOrder(_order!),
            ),
    );
  }

  Widget _buildErrorView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline_rounded, size: 52),
            const SizedBox(height: 12),
            Text(_error!, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _load,
              icon: const Icon(Icons.refresh_rounded),
              label: Text(tr('retry')),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOrder(B2BOrderModel order) {
    final isBuyer = order.buyerOrganizationId == widget.currentOrganizationId;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _headerCard(order),
        const SizedBox(height: 12),
        _chatAccessCard(order, isBuyer),
        if (order.obligations.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text(
            tr('payment_obligations'),
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          ...order.obligations.map(
            (obligation) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _obligationCard(order, obligation, isBuyer),
            ),
          ),
        ],
        if (order.statusHistory.isNotEmpty ||
            order.trackingEvents.isNotEmpty) ...[
          const SizedBox(height: 6),
          _timelineCard(order),
        ],
        const SizedBox(height: 16),
        _orderActions(order),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _headerCard(B2BOrderModel order) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    order.orderNumber,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                _StatusPill(status: order.status),
              ],
            ),
            const SizedBox(height: 4),
            Wrap(
              spacing: 7,
              runSpacing: 7,
              children: [
                if (order.attention?.requiresAction == true)
                  _MiniChip(
                    label: tr('order_requires_action'),
                    color: AppColors.warning,
                    icon: Icons.priority_high_rounded,
                  ),
                if (order.paymentState != 'not_issued')
                  _MiniChip(
                    label: switch (order.paymentState) {
                      'pending' => tr('payment_pending'),
                      'partial' => tr('payment_partial'),
                      'paid' => tr('payment_paid'),
                      _ => order.paymentState,
                    },
                    color: const Color(0xFF7C3AED),
                    icon: Icons.payments_outlined,
                  ),
              ],
            ),
            if (order.status == OrderStatus.awaitingPayments &&
                order.paymentDueAt != null) ...[
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 9,
                ),
                decoration: BoxDecoration(
                  color: AppColors.warning.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.schedule_rounded,
                      size: 17,
                      color: AppColors.warning,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        tr(
                          'order_payment_due',
                          namedArgs: {
                            'date': _formatDateTime(order.paymentDueAt!),
                          },
                        ),
                        style: const TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                          color: AppColors.warning,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            const Divider(height: 22),
            _metaRow(Icons.storefront_outlined, tr('order_seller'), order.sellerName),
            _metaRow(Icons.person_outline_rounded, tr('order_buyer'), order.buyerName),
            if (order.shipperName.isNotEmpty)
              _metaRow(
                Icons.local_shipping_outlined,
                tr('shipping'),
                order.shipperName,
              ),
            const Divider(height: 22),
            _amountRow(
              tr('order_goods'),
              (order.goodsSubtotalPiasters / 100).toStringAsFixed(2),
            ),
            _amountRow(
              tr('order_platform_fee'),
              (order.platformFeePiasters / 100).toStringAsFixed(2),
            ),
            _amountRow(tr('shipping'), order.shippingCost.toStringAsFixed(2)),
            const Divider(height: 22),
            Row(
              children: [
                Text(tr('total')),
                const Spacer(),
                Text(
                  '${order.totalAmount.toStringAsFixed(2)} ${tr('currency_egp')}',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _metaRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Icon(icon, size: 17, color: AppColors.muted),
          const SizedBox(width: 9),
          Text(label, style: const TextStyle(color: AppColors.muted)),
          const Spacer(),
          Flexible(
            child: Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }

  Widget _amountRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Text(label, style: const TextStyle(color: AppColors.muted)),
          const Spacer(),
          Text('$value ${tr('currency_egp')}'),
        ],
      ),
    );
  }

  Widget? _paymentAction(
    B2BOrderModel order,
    PaymentObligationModel obligation,
    bool isBuyer,
  ) {
    if (isBuyer && ['pending', 'rejected'].contains(obligation.status)) {
      return IconButton(
        icon: const Icon(Icons.upload_file),
        tooltip: tr('payment_upload_proof'),
        onPressed: _busy ? null : () => _submitProof(obligation),
      );
    }
    final isBeneficiary =
        obligation.beneficiaryOrganizationId == widget.currentOrganizationId;
    if (isBeneficiary && obligation.status == 'proof_submitted') {
      return PopupMenuButton<String>(
        tooltip: tr('payment_review_proof'),
        onSelected: (value) => _reviewPayment(obligation, value),
        itemBuilder: (_) => [
          PopupMenuItem(
            value: 'confirm',
            child: Row(
              children: [
                const Icon(Icons.check_circle_outline, size: 19),
                const SizedBox(width: 10),
                Text(tr('payment_confirm_receipt')),
              ],
            ),
          ),
          PopupMenuItem(
            value: 'reject',
            child: Row(
              children: [
                const Icon(Icons.cancel_outlined, size: 19),
                const SizedBox(width: 10),
                Text(tr('payment_reject_proof')),
              ],
            ),
          ),
        ],
      );
    }
    return null;
  }

  Widget _obligationCard(
    B2BOrderModel order,
    PaymentObligationModel obligation,
    bool isBuyer,
  ) {
    final statusColor = switch (obligation.status) {
      'confirmed' => AppColors.success,
      'proof_submitted' => const Color(0xFF0369A1),
      'rejected' => AppColors.danger,
      'disputed' => AppColors.warning,
      _ => AppColors.muted,
    };
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            CircleAvatar(
              radius: 19,
              backgroundColor: statusColor.withValues(alpha: 0.11),
              foregroundColor: statusColor,
              child: Icon(switch (obligation.kind) {
                'platform_fee' => Icons.account_balance_outlined,
                'shipping' => Icons.local_shipping_outlined,
                _ => Icons.inventory_2_outlined,
              }, size: 20),
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
                          _kindName(obligation.kind),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                      Text(
                        '${(obligation.amountPiasters / 100).toStringAsFixed(2)} ${tr('currency_egp')}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _paymentStatus(obligation.status),
                    style: TextStyle(color: statusColor, fontSize: 12.5),
                  ),
                  if (obligation.rejectionReason != null)
                    Text(
                      obligation.rejectionReason!,
                      style: const TextStyle(
                        color: AppColors.danger,
                        fontSize: 12,
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 4),
            if (_paymentAction(order, obligation, isBuyer) != null)
              _paymentAction(order, obligation, isBuyer)!,
          ],
        ),
      ),
    );
  }

  Widget _timelineCard(B2BOrderModel order) {
    final entries =
        <_OrderTimelineEntry>[
          ...order.statusHistory.map(
            (history) => _OrderTimelineEntry(
              title: history.status.displayName,
              subtitle: history.note ?? _roleName(history.changedByRole),
              date: history.timestamp,
              icon: Icons.task_alt_outlined,
              color: AppColors.primary,
            ),
          ),
          ...order.trackingEvents.map(
            (tracking) => _OrderTimelineEntry(
              title: _trackingEventName(tracking.eventType),
              subtitle:
                  '${tracking.location}${tracking.note == null || tracking.note!.isEmpty ? '' : ' — ${tracking.note}'}',
              date: tracking.occurredAt,
              icon: Icons.local_shipping_outlined,
              color: const Color(0xFF0369A1),
            ),
          ),
        ]..sort((a, b) {
          if (a.date == null) return -1;
          if (b.date == null) return 1;
          return a.date!.compareTo(b.date!);
        });
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              tr('order_timeline_title'),
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            ...entries.map(
              (entry) => ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: CircleAvatar(
                  radius: 17,
                  backgroundColor: entry.color.withValues(alpha: 0.11),
                  child: Icon(entry.icon, size: 17, color: entry.color),
                ),
                title: Text(
                  entry.title,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                subtitle: Text(
                  '${entry.subtitle}${entry.date == null ? '' : '\n${_formatDateTime(entry.date!.toLocal())}'}',
                  style: const TextStyle(fontSize: 12.5),
                ),
                isThreeLine: entry.subtitle.length > 42,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _orderActions(B2BOrderModel order) {
    final actions = order.allowedActions
        .where((action) => action != 'add_tracking_checkpoint')
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (order.allowedActions.contains('add_tracking_checkpoint'))
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: OutlinedButton.icon(
              onPressed: _busy ? null : _addTrackingEvent,
              icon: const Icon(Icons.add_location_alt_outlined),
              label: Text(tr('tracking_add_shipment')),
            ),
          ),
        if (actions.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              tr('order_available_actions'),
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
          ...actions.map((action) {
            final pending = _pendingAction == action;
            final destructive = [
              'reject',
              'cancel',
              'open_dispute',
            ].contains(action);
            final icon = pending
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Icon(_actionIcon(action), size: 19);
            final button = destructive
                ? OutlinedButton.icon(
                    onPressed: _busy ? null : () => _performNamedAction(action),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.danger,
                      side: BorderSide(
                        color: AppColors.danger.withValues(alpha: 0.45),
                      ),
                    ),
                    icon: icon,
                    label: Text(_actionLabel(action)),
                  )
                : FilledButton.icon(
                    onPressed: _busy ? null : () => _performNamedAction(action),
                    icon: icon,
                    label: Text(_actionLabel(action)),
                  );
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: SizedBox(height: 48, child: button),
            );
          }),
        ],
        if (actions.isEmpty &&
            !order.allowedActions.contains('add_tracking_checkpoint'))
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: Theme.of(
                context,
              ).colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
              borderRadius: BorderRadius.circular(12),
            ),
            alignment: Alignment.center,
            child: Text(
              tr(
                'order_no_actions',
                namedArgs: {'status': order.status.displayName},
              ),
              textAlign: TextAlign.center,
            ),
          ),
      ],
    );
  }

  Widget _chatAccessCard(B2BOrderModel order, bool isBuyer) {
    final access = order.chatAccess;
    final allowed = access?.allowed ?? false;
    final amount =
        (access?.platformFeeAmountPiasters ?? order.platformFeePiasters) / 100;
    PaymentObligationModel? platformFee;
    for (final obligation in order.obligations) {
      if (obligation.kind == 'platform_fee') platformFee = obligation;
    }
    if (allowed) {
      return Card(
        color: const Color(0xFFE8F5F2),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              const CircleAvatar(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                child: Icon(Icons.forum_outlined),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      tr('order_chat_follow'),
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    Text(tr('order_chat_description')),
                  ],
                ),
              ),
              FilledButton.icon(
                onPressed: _busy ? null : _openChat,
                icon: _openingChat
                    ? const SizedBox(
                        width: 17,
                        height: 17,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.chat_bubble_outline_rounded, size: 18),
                label: Text(tr('order_chat_enter')),
              ),
            ],
          ),
        ),
      );
    }

    final feeStatus = access?.platformFeeStatus ?? 'not_issued';
    final statusText = switch (feeStatus) {
      'proof_submitted' => tr('order_fee_status_proof_submitted'),
      'rejected' => tr('order_fee_status_rejected'),
      'pending' => tr('order_fee_status_pending'),
      _ => tr('order_fee_status_default'),
    };
    return Card(
      color: const Color(0xFFFFF7E6),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.lock_outline, color: Color(0xFFB45309)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    tr('order_chat_locked_buyer'),
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  Text(
                    tr(
                      'order_chat_unlock_message',
                      namedArgs: {
                        'amount': amount.toStringAsFixed(2),
                        'statusText': statusText,
                      },
                    ),
                  ),
                  if (isBuyer &&
                      platformFee != null &&
                      ['pending', 'rejected'].contains(platformFee.status)) ...[
                    const SizedBox(height: 10),
                    FilledButton.icon(
                      onPressed: _busy
                          ? null
                          : () => _submitProof(platformFee!),
                      icon: const Icon(Icons.upload_file, size: 18),
                      label: Text(tr('order_upload_platform_fee')),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _performNamedAction(String action) async {
    String? note;
    if ([
      'reject',
      'cancel',
      'open_dispute',
      'resolve_dispute_complete',
      'resolve_dispute_cancel',
    ].contains(action)) {
      note = await _askForNote(action);
      if (note == null) return;
    }
    await _action(action, note: note);
  }

  Future<String?> _askForNote(String action) async {
    final controller = TextEditingController();
    final title = switch (action) {
      'reject' => tr('order_reject_reason_title'),
      'cancel' => tr('order_cancel_reason_title'),
      'open_dispute' => tr('order_dispute_reason_title'),
      _ => tr('order_decision_summary_title'),
    };
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(title),
          content: TextField(
            controller: controller,
            autofocus: true,
            maxLines: 4,
            minLines: 2,
            onChanged: (_) => setDialogState(() {}),
            decoration: InputDecoration(hintText: tr('order_note_hint')),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: Text(tr('order_back')),
            ),
            FilledButton(
              onPressed: controller.value.text.trim().length >= 3
                  ? () => Navigator.pop(context, true)
                  : null,
              child: Text(tr('order_confirm')),
            ),
          ],
        ),
      ),
    );
    final value = controller.text.trim();
    controller.dispose();
    return confirmed == true && value.length >= 3 ? value : null;
  }

  String _kindName(String kind) => switch (kind) {
    'platform_fee' => tr('payment_kind_platform_fee'),
    'goods' => tr('payment_kind_goods'),
    'shipping' => tr('payment_kind_shipping'),
    _ => kind,
  };

  String _paymentStatus(String status) => switch (status) {
    'pending' => tr('payment_status_pending'),
    'proof_submitted' => tr('payment_status_proof_submitted'),
    'confirmed' => tr('payment_status_confirmed'),
    'rejected' => tr('payment_status_rejected'),
    'disputed' => tr('payment_status_disputed'),
    _ => status,
  };

  String _trackingEventName(String type) => switch (type) {
    'picked_up' => tr('tracking_event_picked_up'),
    'checkpoint' => tr('tracking_event_checkpoint'),
    'out_for_delivery' => tr('tracking_event_out_for_delivery'),
    'delivery_attempt' => tr('tracking_event_delivery_attempt'),
    'delivered' => tr('tracking_event_delivered'),
    'exception' => tr('tracking_event_exception'),
    _ => tr('tracking_event_default'),
  };

  String _roleName(String role) => switch (role.toLowerCase()) {
    'wholesaler' => tr('order_seller'),
    'retailer' => tr('order_buyer'),
    'shipper' => tr('order_shipper_role'),
    'admin' => tr('order_admin_role'),
    _ => tr('order_system_role'),
  };

  static String _formatDateTime(DateTime value) {
    String two(int number) => number.toString().padLeft(2, '0');
    return '${value.year}/${two(value.month)}/${two(value.day)} · ${two(value.hour)}:${two(value.minute)}';
  }

  static String _actionLabel(String action) => switch (action) {
    'accept' => tr('order_action_accept'),
    'reject' => tr('order_action_reject'),
    'mark_ready' => tr('order_action_mark_ready'),
    'confirm_pickup' => tr('order_action_confirm_pickup'),
    'confirm_delivery' => tr('order_action_confirm_delivery'),
    'confirm_receipt' => tr('order_action_confirm_receipt'),
    'cancel' => tr('order_action_cancel'),
    'open_dispute' => tr('order_action_open_dispute'),
    'resolve_dispute_complete' => tr('order_action_resolve_dispute_complete'),
    'resolve_dispute_cancel' => tr('order_action_resolve_dispute_cancel'),
    _ => action,
  };

  static IconData _actionIcon(String action) => switch (action) {
    'accept' => Icons.check_circle_outline_rounded,
    'reject' => Icons.cancel_outlined,
    'mark_ready' => Icons.inventory_2_outlined,
    'confirm_pickup' => Icons.local_shipping_outlined,
    'confirm_delivery' => Icons.mark_email_read_outlined,
    'confirm_receipt' => Icons.receipt_long_rounded,
    'cancel' => Icons.do_not_disturb_on_outlined,
    'open_dispute' => Icons.gavel_outlined,
    'resolve_dispute_complete' => Icons.fact_check_outlined,
    'resolve_dispute_cancel' => Icons.rule_outlined,
    _ => Icons.tune_rounded,
  };

  static String _actionSuccessMessage(String action) => switch (action) {
    'accept' => tr('order_action_success_accept'),
    'reject' => tr('order_action_success_reject'),
    'mark_ready' => tr('order_action_success_mark_ready'),
    'confirm_pickup' => tr('order_action_success_confirm_pickup'),
    'confirm_delivery' => tr('order_action_success_confirm_delivery'),
    'confirm_receipt' => tr('order_action_success_confirm_receipt'),
    'cancel' => tr('order_action_success_cancel'),
    'open_dispute' => tr('order_action_success_open_dispute'),
    'resolve_dispute_complete' =>
        tr('order_action_success_resolve_dispute_complete'),
    'resolve_dispute_cancel' =>
        tr('order_action_success_resolve_dispute_cancel'),
    _ => tr('order_action_success_default'),
  };
}

class _StatusPill extends StatelessWidget {
  final OrderStatus status;

  const _StatusPill({required this.status});

  @override
  Widget build(BuildContext context) {
    final color = _color;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.11),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(_icon, size: 15, color: color),
          const SizedBox(width: 5),
          Text(
            status.displayName,
            style: TextStyle(
              color: color,
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  Color get _color => switch (status) {
    OrderStatus.completed => AppColors.success,
    OrderStatus.rejected || OrderStatus.canceled => const Color(0xFFB91C1C),
    OrderStatus.disputed => const Color(0xFFB45309),
    OrderStatus.inTransit || OrderStatus.delivered => const Color(0xFF0369A1),
    OrderStatus.awaitingPayments => const Color(0xFF7C3AED),
    OrderStatus.preparing => AppColors.success,
    _ => AppColors.primary,
  };

  IconData get _icon => switch (status) {
    OrderStatus.completed => Icons.task_alt_rounded,
    OrderStatus.rejected || OrderStatus.canceled => Icons.cancel_outlined,
    OrderStatus.disputed => Icons.gavel_outlined,
    OrderStatus.inTransit => Icons.route_outlined,
    OrderStatus.delivered => Icons.move_to_inbox_outlined,
    OrderStatus.awaitingPayments => Icons.account_balance_wallet_outlined,
    OrderStatus.preparing => Icons.inventory_2_outlined,
    OrderStatus.readyForPickup => Icons.local_shipping_outlined,
    OrderStatus.requested => Icons.mark_email_unread_outlined,
    OrderStatus.unknown => Icons.help_outline_rounded,
  };
}

class _MiniChip extends StatelessWidget {
  final String label;
  final Color color;
  final IconData icon;

  const _MiniChip({
    required this.label,
    required this.color,
    required this.icon,
  });

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
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
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

class _OrderTimelineEntry {
  final String title;
  final String subtitle;
  final DateTime? date;
  final IconData icon;
  final Color color;
  const _OrderTimelineEntry({
    required this.title,
    required this.subtitle,
    required this.date,
    required this.icon,
    required this.color,
  });
}
