import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import '../../../../core/constants/api_constants.dart';
import '../../../../core/di/service_locator.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../../core/network/network_manager.dart';

class MerchantPaymentSettingsScreen extends StatefulWidget {
  const MerchantPaymentSettingsScreen({super.key});
  @override
  State<MerchantPaymentSettingsScreen> createState() =>
      _MerchantPaymentSettingsScreenState();
}

class _MerchantPaymentSettingsScreenState
    extends State<MerchantPaymentSettingsScreen> {
  late final INetworkManager _network;
  final _holder = TextEditingController();
  final _instapay = TextEditingController();
  final _wallet = TextEditingController();
  final _bank = TextEditingController();
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _network = ServiceLocator.network();
    _load();
  }

  Future<void> _load() async {
    try {
      final response = await _network.get<Map<String, dynamic>>(
        ApiConstants.paymentAccounts,
      );
      final rows = response['accounts'] as List<dynamic>? ?? const [];
      for (final raw in rows) {
        final account = raw as Map<String, dynamic>;
        _holder.text = account['account_holder']?.toString() ?? _holder.text;
        switch (account['method']) {
          case 'instapay':
            _instapay.text = account['account_reference']?.toString() ?? '';
            break;
          case 'mobile_wallet':
            _wallet.text = account['account_reference']?.toString() ?? '';
            break;
          case 'bank_transfer':
            _bank.text = account['account_reference']?.toString() ?? '';
            break;
        }
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

  Future<void> _save() async {
    if (_holder.text.trim().length < 2) {
      ErrorHandler.showSecureSnackBar(
        context,
        tr('merchant_account_holder_required'),
        isError: true,
      );
      return;
    }
    final accounts = <Map<String, dynamic>>[];
    void add(String method, String label, TextEditingController controller) {
      if (controller.text.trim().isEmpty) return;
      accounts.add({
        'method': method,
        'label': label,
        'account_holder': _holder.text.trim(),
        'account_reference': controller.text.trim(),
        'is_active': true,
      });
    }

    add('instapay', 'InstaPay', _instapay);
    add('mobile_wallet', 'محفظة إلكترونية', _wallet);
    add('bank_transfer', 'تحويل بنكي', _bank);
    if (accounts.isEmpty) {
      ErrorHandler.showSecureSnackBar(
        context,
        tr('merchant_add_local_payment'),
        isError: true,
      );
      return;
    }
    setState(() => _saving = true);
    try {
      await _network.put<Map<String, dynamic>>(
        ApiConstants.paymentAccounts,
        data: {'accounts': accounts},
      );
      if (mounted) {
        ErrorHandler.showSecureSnackBar(
          context,
          tr('merchant_saved'),
          isError: false,
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
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  void dispose() {
    _holder.dispose();
    _instapay.dispose();
    _wallet.dispose();
    _bank.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('merchant_payment_title'))),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(tr('merchant_payment_info')),
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _holder,
                  decoration: InputDecoration(
                    labelText: tr('merchant_account_holder'),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _instapay,
                  decoration: InputDecoration(
                    labelText: tr('merchant_instapay_hint'),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _wallet,
                  keyboardType: TextInputType.phone,
                  decoration: InputDecoration(
                    labelText: tr('merchant_wallet_hint'),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _bank,
                  decoration: InputDecoration(
                    labelText: tr('merchant_bank_hint'),
                  ),
                ),
                const SizedBox(height: 20),
                SizedBox(
                  height: 50,
                  child: ElevatedButton(
                    onPressed: _saving ? null : _save,
                    child: _saving
                        ? const CircularProgressIndicator(color: Colors.white)
                        : Text(tr('save')),
                  ),
                ),
              ],
            ),
    );
  }
}
