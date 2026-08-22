import 'package:flutter/material.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../../core/network/network_manager.dart';

class ShippingRatesManagementScreen extends StatefulWidget {
  final String organizationId;

  const ShippingRatesManagementScreen({
    super.key,
    required this.organizationId,
  });

  @override
  State<ShippingRatesManagementScreen> createState() =>
      _ShippingRatesManagementScreenState();
}

class _ShippingRatesManagementScreenState
    extends State<ShippingRatesManagementScreen> {
  late final INetworkManager _network;
  List<Map<String, dynamic>> _rates = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _network = ServiceLocator.network();
    _load();
  }

  Future<void> _load() async {
    try {
      final response = await _network.get<Map<String, dynamic>>(
        '/shippers/rates?shipper_organization_id=${widget.organizationId}',
        requiresAuth: false,
      );
      if (mounted) {
        setState(
          () => _rates = (response['rates'] as List<dynamic>? ?? const [])
              .map((item) => Map<String, dynamic>.from(item as Map))
              .toList(),
        );
      }
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

  Future<void> _edit([Map<String, dynamic>? rate]) async {
    final from = TextEditingController(
      text: rate?['from_governorate']?.toString() ?? '',
    );
    final to = TextEditingController(
      text: rate?['to_governorate']?.toString() ?? '',
    );
    final price = TextEditingController(
      text: rate == null
          ? ''
          : (((rate['price_piasters'] as num?) ?? 0) / 100).toStringAsFixed(2),
    );
    final days = TextEditingController(
      text: rate?['estimated_days']?.toString() ?? '1',
    );
    final submit = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('تعريفة شحن'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: from,
                decoration: const InputDecoration(labelText: 'من محافظة'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: to,
                decoration: const InputDecoration(labelText: 'إلى محافظة'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: price,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(labelText: 'السعر بالجنيه'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: days,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'مدة التوصيل بالأيام',
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('حفظ'),
          ),
        ],
      ),
    );
    if (submit == true) {
      try {
        final priceValue =
            double.tryParse(price.text.trim().replaceAll(',', '.')) ?? -1;
        final daysValue = int.tryParse(days.text.trim()) ?? 0;
        if (from.text.trim().length < 2 ||
            to.text.trim().length < 2 ||
            priceValue < 0 ||
            daysValue < 1) {
          throw const FormatException('راجع بيانات التعريفة.');
        }
        await _network.post<Map<String, dynamic>>(
          '/shippers/rates',
          data: {
            'from_governorate': from.text.trim(),
            'to_governorate': to.text.trim(),
            'price_piasters': (priceValue * 100).round(),
            'estimated_days': daysValue,
            'is_active': true,
          },
        );
        await _load();
      } catch (error) {
        if (mounted) {
          ErrorHandler.showSecureSnackBar(
            context,
            error is FormatException
                ? error.message.toString()
                : ErrorHandler.getUserFriendlyMessage(error),
            isError: true,
          );
        }
      }
    }
    from.dispose();
    to.dispose();
    price.dispose();
    days.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('تعريفات الشحن')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _rates.isEmpty
          ? const Center(child: Text('لا توجد تعريفات نشطة.'))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: _rates.length,
                itemBuilder: (context, index) {
                  final rate = _rates[index];
                  final price =
                      ((rate['price_piasters'] as num?)?.toInt() ?? 0) / 100;
                  return Card(
                    child: ListTile(
                      leading: const Icon(Icons.local_shipping_outlined),
                      title: Text(
                        '${rate['from_governorate']} ← ${rate['to_governorate']}',
                      ),
                      subtitle: Text(
                        '${price.toStringAsFixed(2)} ج.م • ${rate['estimated_days']} يوم',
                      ),
                      trailing: IconButton(
                        onPressed: () => _edit(rate),
                        icon: const Icon(Icons.edit_outlined),
                      ),
                    ),
                  );
                },
              ),
            ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _edit,
        icon: const Icon(Icons.add),
        label: const Text('إضافة تعريفة'),
      ),
    );
  }
}
