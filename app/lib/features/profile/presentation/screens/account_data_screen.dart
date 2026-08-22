import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../../core/network/network_manager.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';

class AccountDataScreen extends StatefulWidget {
  const AccountDataScreen({super.key});

  @override
  State<AccountDataScreen> createState() => _AccountDataScreenState();
}

class _AccountDataScreenState extends State<AccountDataScreen> {
  late final INetworkManager _network;
  Map<String, dynamic>? _request;
  bool _working = false;

  @override
  void initState() {
    super.initState();
    _network = ServiceLocator.network();
    _load();
  }

  Future<void> _load() async {
    try {
      final response = await _network.get<Map<String, dynamic>>(
        '/account/deletion',
      );
      if (mounted) {
        setState(
          () =>
              _request = response['deletion_request'] as Map<String, dynamic>?,
        );
      }
    } catch (_) {}
  }

  Future<String?> _askPassword({
    required String title,
    required bool requireDeleteWord,
  }) async {
    final password = TextEditingController();
    final confirmation = TextEditingController();
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: password,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'كلمة المرور'),
            ),
            if (requireDeleteWord) ...[
              const SizedBox(height: 10),
              TextField(
                controller: confirmation,
                decoration: const InputDecoration(
                  labelText: 'اكتب DELETE للتأكيد',
                ),
              ),
            ],
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(
              context,
              !requireDeleteWord || confirmation.text.trim() == 'DELETE',
            ),
            child: const Text('تأكيد'),
          ),
        ],
      ),
    );
    final value = accepted == true && password.text.length >= 8
        ? password.text
        : null;
    password.dispose();
    confirmation.dispose();
    return value;
  }

  Future<void> _export() async {
    setState(() => _working = true);
    try {
      final data = await _network.get<Map<String, dynamic>>('/account/export');
      await Clipboard.setData(
        ClipboardData(text: const JsonEncoder.withIndent('  ').convert(data)),
      );
      if (mounted) {
        ErrorHandler.showSecureSnackBar(
          context,
          'تم نسخ ملف بياناتك بصيغة JSON',
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
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _scheduleDeletion() async {
    final password = await _askPassword(
      title: 'جدولة حذف الحساب بعد 30 يومًا',
      requireDeleteWord: true,
    );
    if (password == null || !mounted) return;
    setState(() => _working = true);
    try {
      await _network.post<Map<String, dynamic>>(
        '/account/deletion',
        data: {'password': password, 'confirmation': 'DELETE'},
      );
      if (mounted) await context.read<AuthCubit>().logout();
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

  Future<void> _cancelDeletion() async {
    final password = await _askPassword(
      title: 'إلغاء طلب الحذف',
      requireDeleteWord: false,
    );
    if (password == null) return;
    setState(() => _working = true);
    try {
      await _network.delete<Map<String, dynamic>>(
        '/account/deletion',
        data: {'password': password},
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

  @override
  Widget build(BuildContext context) {
    final scheduled = _request?['status'] == 'scheduled';
    return Scaffold(
      appBar: AppBar(title: const Text('بيانات الحساب والخصوصية')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ListTile(
            leading: const Icon(Icons.download_outlined),
            title: const Text('تنزيل نسخة من بياناتي'),
            subtitle: const Text(
              'ينسخ ملف JSON يتضمن الحساب والمنشأة والطلبات والمدفوعات.',
            ),
            trailing: const Icon(Icons.copy),
            onTap: _working ? null : _export,
          ),
          const Divider(),
          if (scheduled)
            ListTile(
              leading: const Icon(Icons.restore, color: Colors.orange),
              title: const Text('إلغاء حذف الحساب'),
              subtitle: Text(
                'الحذف مجدول في ${_request?['scheduled_for'] ?? ''}',
              ),
              onTap: _working ? null : _cancelDeletion,
            )
          else
            ListTile(
              leading: const Icon(
                Icons.delete_forever_outlined,
                color: Colors.red,
              ),
              title: const Text('حذف الحساب'),
              subtitle: const Text(
                'يتم الحذف بعد 30 يومًا مع الاحتفاظ بالسجلات النظامية اللازمة.',
              ),
              onTap: _working ? null : _scheduleDeletion,
            ),
          if (_working)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: CircularProgressIndicator(),
              ),
            ),
        ],
      ),
    );
  }
}
