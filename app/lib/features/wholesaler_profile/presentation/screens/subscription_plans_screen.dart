import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/constants/api_constants.dart';
import '../../../../core/di/service_locator.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../../core/network/network_manager.dart';

class SubscriptionPlansScreen extends StatefulWidget {
  final String userRole;
  const SubscriptionPlansScreen({super.key, required this.userRole});
  @override
  State<SubscriptionPlansScreen> createState() =>
      _SubscriptionPlansScreenState();
}

class _SubscriptionPlansScreenState extends State<SubscriptionPlansScreen> {
  late final INetworkManager _network;
  List<Map<String, dynamic>> _plans = const [];
  List<Map<String, dynamic>> _invoices = const [];
  Map<String, dynamic>? _subscription;
  bool _loading = true;
  bool _working = false;

  @override
  void initState() {
    super.initState();
    _network = ServiceLocator.network();
    _load();
  }

  String get _organizationType => switch (widget.userRole.toLowerCase()) {
    'wholesaler' => 'wholesaler',
    'shipper' => 'shipper',
    _ => 'buyer',
  };

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        _network.get<Map<String, dynamic>>(
          '/subscriptions',
          queryParameters: {'organization_type': _organizationType},
          requiresAuth: false,
        ),
        _network.get<Map<String, dynamic>>(ApiConstants.currentSubscription),
      ]);
      if (!mounted) return;
      setState(() {
        _plans = ((results[0]['plans'] as List<dynamic>?) ?? const [])
            .map((row) => Map<String, dynamic>.from(row as Map))
            .toList();
        _subscription = results[1]['subscription'] as Map<String, dynamic>?;
        _invoices = ((results[1]['invoices'] as List<dynamic>?) ?? const [])
            .map((row) => Map<String, dynamic>.from(row as Map))
            .toList();
      });
    } catch (error) {
      if (mounted) {
        ErrorHandler.showSecureSnackBar(
          context,
          ErrorHandler.getUserFriendlyMessage(error),
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _subscribe(String planId) async {
    setState(() => _working = true);
    try {
      await _network.post<Map<String, dynamic>>(
        '/subscriptions',
        data: {'plan_id': planId},
      );
      await _load();
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

  Future<void> _submitProof(Map<String, dynamic> invoice) async {
    final accountsResponse = await _network.get<Map<String, dynamic>>(
      '/platform/payment-accounts',
    );
    if (!mounted) return;
    final accounts = accountsResponse['accounts'] as List<dynamic>? ?? const [];
    if (accounts.isEmpty) {
      if (mounted) {
        ErrorHandler.showSecureSnackBar(
          context,
          'حساب تحصيل المنصة غير مضبوط بعد',
          isError: true,
        );
      }
      return;
    }
    final reference = TextEditingController();
    String method = (accounts.first as Map)['method']?.toString() ?? 'instapay';
    final proceed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('بيانات تحويل الاشتراك'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: method,
                items: accounts.map((raw) {
                  final account = raw as Map;
                  return DropdownMenuItem<String>(
                    value: account['method']?.toString(),
                    child: Text(
                      '${account['label']} — ${account['account_reference']}',
                    ),
                  );
                }).toList(),
                onChanged: (value) =>
                    setDialogState(() => method = value ?? method),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: reference,
                decoration: const InputDecoration(
                  labelText: 'رقم/مرجع التحويل',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('إلغاء'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('اختيار الإيصال'),
            ),
          ],
        ),
      ),
    );
    if (proceed != true || reference.text.trim().length < 3) return;
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 80,
      maxWidth: 1800,
    );
    if (picked == null) return;
    if (!mounted) return;
    setState(() => _working = true);
    try {
      final bytes = await picked.readAsBytes();
      final mime =
          picked.mimeType ??
          (picked.name.endsWith('.png') ? 'image/png' : 'image/jpeg');
      final upload = await _network.post<Map<String, dynamic>>(
        '/upload',
        data: {
          'fileData': 'data:$mime;base64,${base64Encode(bytes)}',
          'fileType': 'image',
          'mimeType': mime,
        },
      );
      final url = (upload['media'] as Map<String, dynamic>)['url'];
      await _network.post<Map<String, dynamic>>(
        '/subscriptions/invoices/${invoice['_id']}/proof',
        data: {
          'payment_method': method,
          'sender_reference': reference.text.trim(),
          'proof_url': url,
        },
      );
      await _load();
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

  @override
  Widget build(BuildContext context) {
    final openInvoices = _invoices
        .where(
          (invoice) => [
            'pending',
            'rejected',
            'proof_submitted',
          ].contains(invoice['status']),
        )
        .toList();
    return Scaffold(
      appBar: AppBar(title: const Text('اشتراك المؤسسة')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        'الحالة: ${_subscription?['status'] ?? 'لا يوجد اشتراك'}\nنهاية الفترة: ${_subscription?['current_period_ends_at'] ?? '-'}',
                      ),
                    ),
                  ),
                  if (openInvoices.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    const Text(
                      'فواتير تحتاج إجراء',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 17,
                      ),
                    ),
                    ...openInvoices.map(
                      (invoice) => Card(
                        child: ListTile(
                          title: Text(
                            invoice['invoice_number']?.toString() ?? '',
                          ),
                          subtitle: Text(
                            '${((invoice['amount_piasters'] as num? ?? 0) / 100).toStringAsFixed(2)} ج.م — ${invoice['status']}',
                          ),
                          trailing:
                              [
                                'pending',
                                'rejected',
                              ].contains(invoice['status'])
                              ? IconButton(
                                  icon: const Icon(Icons.upload_file),
                                  onPressed: _working
                                      ? null
                                      : () => _submitProof(invoice),
                                )
                              : const Icon(Icons.hourglass_top),
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                  const Text(
                    'الخطط المتاحة',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
                  ),
                  if (_plans.isEmpty)
                    const Card(
                      child: Padding(
                        padding: EdgeInsets.all(16),
                        child: Text('لم تُضف الإدارة أسعار الخطط بعد.'),
                      ),
                    )
                  else
                    ..._plans.map(
                      (plan) => Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                plan['name_ar']?.toString() ?? '',
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 17,
                                ),
                              ),
                              Text(
                                '${((plan['price_piasters'] as num? ?? 0) / 100).toStringAsFixed(2)} ج.م / ${plan['billing_interval'] == 'yearly' ? 'سنة' : 'شهر'}',
                              ),
                              const SizedBox(height: 10),
                              SizedBox(
                                width: double.infinity,
                                child: ElevatedButton(
                                  onPressed: _working || openInvoices.isNotEmpty
                                      ? null
                                      : () =>
                                            _subscribe(plan['_id'].toString()),
                                  child: const Text('إنشاء فاتورة اشتراك'),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}
