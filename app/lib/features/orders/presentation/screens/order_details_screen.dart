import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

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
        'تُفتح متابعة الطلب بعد تأكيد رسوم المنصة (${amount.toStringAsFixed(2)} ج.م).',
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
            title: 'طلب ${_order?.orderNumber ?? ''}',
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
          title: const Text('إرسال إثبات التحويل'),
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
                decoration: const InputDecoration(
                  labelText: 'مرجع/رقم التحويل',
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'بعد المتابعة اختر صورة إيصال التحويل.',
                style: TextStyle(fontSize: 12),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('إلغاء'),
            ),
            ElevatedButton.icon(
              onPressed: () => Navigator.pop(context, true),
              icon: const Icon(Icons.upload_file_outlined, size: 18),
              label: const Text('اختيار الإيصال'),
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
            'أدخل مرجع التحويل أولًا.',
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
          'تم إرسال إثبات التحويل وهو قيد المراجعة.',
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
          decision == 'confirm' ? 'تم تأكيد الدفعة.' : 'تم رفض الإثبات.',
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
          title: const Text('إضافة محطة متابعة'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: eventType,
                items: const [
                  DropdownMenuItem(
                    value: 'checkpoint',
                    child: Text('محطة عبور'),
                  ),
                  DropdownMenuItem(
                    value: 'out_for_delivery',
                    child: Text('خرج للتسليم النهائي'),
                  ),
                  DropdownMenuItem(
                    value: 'delivery_attempt',
                    child: Text('محاولة تسليم'),
                  ),
                  DropdownMenuItem(
                    value: 'exception',
                    child: Text('عائق/تأخير'),
                  ),
                ],
                onChanged: (value) =>
                    setDialogState(() => eventType = value ?? eventType),
                decoration: const InputDecoration(labelText: 'نوع التحديث'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: location,
                decoration: const InputDecoration(
                  labelText: 'الموقع أو اسم المحطة',
                  prefixIcon: Icon(Icons.location_on_outlined),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: note,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'تفاصيل إضافية'),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('إلغاء'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('إضافة التحديث'),
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
          'تمت إضافة محطة المتابعة.',
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
        title: const Text('تفاصيل الطلب'),
        actions: [
          IconButton(
            onPressed: _busy ? null : () => _load(announceFailure: true),
            tooltip: 'تحديث البيانات',
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
              label: const Text('إعادة المحاولة'),
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
            'التزامات الدفع',
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
                  const _MiniChip(
                    label: 'يتطلب إجراء',
                    color: AppColors.warning,
                    icon: Icons.priority_high_rounded,
                  ),
                if (order.paymentState != 'not_issued')
                  _MiniChip(
                    label: switch (order.paymentState) {
                      'pending' => 'بانتظار الدفع',
                      'partial' => 'قيد المراجعة',
                      'paid' => 'المدفوعات مؤكدة',
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
                        'آخر موعد لإرسال إثبات الدفع: ${_formatDateTime(order.paymentDueAt!)}',
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
            _metaRow(Icons.storefront_outlined, 'البائع', order.sellerName),
            _metaRow(Icons.person_outline_rounded, 'المشتري', order.buyerName),
            if (order.shipperName.isNotEmpty)
              _metaRow(
                Icons.local_shipping_outlined,
                'الشحن',
                order.shipperName,
              ),
            const Divider(height: 22),
            _amountRow(
              'البضاعة',
              (order.goodsSubtotalPiasters / 100).toStringAsFixed(2),
            ),
            _amountRow(
              'رسم المنصة',
              (order.platformFeePiasters / 100).toStringAsFixed(2),
            ),
            _amountRow('الشحن', order.shippingCost.toStringAsFixed(2)),
            const Divider(height: 22),
            Row(
              children: [
                const Text('الإجمالي'),
                const Spacer(),
                Text(
                  '${order.totalAmount.toStringAsFixed(2)} ج.م',
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
          Text('$value ج.م'),
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
        tooltip: 'رفع إثبات الدفع',
        onPressed: _busy ? null : () => _submitProof(obligation),
      );
    }
    final isBeneficiary =
        obligation.beneficiaryOrganizationId == widget.currentOrganizationId;
    if (isBeneficiary && obligation.status == 'proof_submitted') {
      return PopupMenuButton<String>(
        tooltip: 'مراجعة إثبات الدفع',
        onSelected: (value) => _reviewPayment(obligation, value),
        itemBuilder: (_) => const [
          PopupMenuItem(
            value: 'confirm',
            child: Row(
              children: [
                Icon(Icons.check_circle_outline, size: 19),
                SizedBox(width: 10),
                Text('تأكيد الاستلام'),
              ],
            ),
          ),
          PopupMenuItem(
            value: 'reject',
            child: Row(
              children: [
                Icon(Icons.cancel_outlined, size: 19),
                SizedBox(width: 10),
                Text('رفض الإثبات'),
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
                        '${(obligation.amountPiasters / 100).toStringAsFixed(2)} ج.م',
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
              'سجل ومتابعة الطلب',
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
              label: const Text('إضافة محطة متابعة للشحنة'),
            ),
          ),
        if (actions.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              'الإجراءات المتاحة',
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
              'لا توجد إجراءات متاحة — الحالة الحالية: ${order.status.displayName}',
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
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'متابعة الطلب',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    Text('محادثة خاصة بين أطراف الطلب وسجل لكل العمليات.'),
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
                label: const Text('دخول'),
              ),
            ],
          ),
        ),
      );
    }

    final feeStatus = access?.platformFeeStatus ?? 'not_issued';
    final statusText = switch (feeStatus) {
      'proof_submitted' => 'إثبات الرسوم قيد مراجعة المنصة',
      'rejected' => 'تم رفض الإثبات؛ راجع البيانات وأعد الإرسال',
      'pending' => 'بانتظار تحويل رسوم المنصة',
      _ => 'تُصدر الرسوم بعد قبول البائع للطلب',
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
                  const Text(
                    'متابعة الطلب مقفولة للمشتري',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  Text(
                    'تُفتح بعد تأكيد رسوم المنصة (${amount.toStringAsFixed(2)} ج.م).\n$statusText',
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
                      label: const Text('رفع إثبات رسوم المنصة'),
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
      'reject' => 'سبب رفض الطلب',
      'cancel' => 'سبب إلغاء الطلب',
      'open_dispute' => 'سبب فتح النزاع',
      _ => 'ملخص القرار',
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
            decoration: const InputDecoration(hintText: 'اكتب تفاصيل واضحة...'),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('رجوع'),
            ),
            FilledButton(
              onPressed: controller.value.text.trim().length >= 3
                  ? () => Navigator.pop(context, true)
                  : null,
              child: const Text('تأكيد'),
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
    'platform_fee' => 'رسوم المنصة',
    'goods' => 'قيمة البضاعة للبائع',
    'shipping' => 'قيمة الشحن',
    _ => kind,
  };

  String _paymentStatus(String status) => switch (status) {
    'pending' => 'بانتظار التحويل',
    'proof_submitted' => 'الإثبات قيد المراجعة',
    'confirmed' => 'تم التأكيد',
    'rejected' => 'الإثبات مرفوض',
    'disputed' => 'متنازع عليه',
    _ => status,
  };

  String _trackingEventName(String type) => switch (type) {
    'picked_up' => 'استلمت شركة الشحن الطلبية',
    'checkpoint' => 'محطة متابعة',
    'out_for_delivery' => 'خرجت للتسليم النهائي',
    'delivery_attempt' => 'محاولة تسليم',
    'delivered' => 'تم التسليم',
    'exception' => 'عائق في الشحن',
    _ => 'تحديث الشحنة',
  };

  String _roleName(String role) => switch (role.toLowerCase()) {
    'wholesaler' => 'البائع',
    'retailer' => 'المشتري',
    'shipper' => 'شركة الشحن',
    'admin' => 'إدارة المنصة',
    _ => 'النظام',
  };

  static String _formatDateTime(DateTime value) {
    String two(int number) => number.toString().padLeft(2, '0');
    return '${value.year}/${two(value.month)}/${two(value.day)} · ${two(value.hour)}:${two(value.minute)}';
  }

  static String _actionLabel(String action) => switch (action) {
    'accept' => 'قبول الطلب وإصدار التزامات الدفع',
    'reject' => 'رفض الطلب',
    'mark_ready' => 'تم تجهيز الطلبية',
    'confirm_pickup' => 'استلمت الطلبية وخرجت للشحن',
    'confirm_delivery' => 'تم تسليم الطلبية للمشتري',
    'confirm_receipt' => 'تأكيد استلام الطلبية',
    'cancel' => 'إلغاء الطلب',
    'open_dispute' => 'فتح نزاع',
    'resolve_dispute_complete' => 'حسم النزاع وإكمال الطلب',
    'resolve_dispute_cancel' => 'حسم النزاع وإلغاء الطلب',
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
    'accept' => 'تم قبول الطلب وإصدار التزامات الدفع',
    'reject' => 'تم رفض الطلب',
    'mark_ready' => 'تم تأكيد تجهيز الطلبية',
    'confirm_pickup' => 'تم استلام الطلبية وبدء الشحن',
    'confirm_delivery' => 'تم تسليم الطلبية للمشتري',
    'confirm_receipt' => 'تم تأكيد استلام الطلبية',
    'cancel' => 'تم إلغاء الطلب',
    'open_dispute' => 'تم فتح النزاع على الطلب',
    'resolve_dispute_complete' => 'تم حسم النزاع وإكمال الطلب',
    'resolve_dispute_cancel' => 'تم حسم النزاع وإلغاء الطلب',
    _ => 'تم تحديث الطلب',
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
