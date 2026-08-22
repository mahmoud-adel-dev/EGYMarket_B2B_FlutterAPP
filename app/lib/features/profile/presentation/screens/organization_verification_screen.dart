import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../../core/network/network_manager.dart';

class OrganizationVerificationScreen extends StatefulWidget {
  const OrganizationVerificationScreen({super.key});

  @override
  State<OrganizationVerificationScreen> createState() =>
      _OrganizationVerificationScreenState();
}

class _OrganizationVerificationScreenState
    extends State<OrganizationVerificationScreen> {
  late final INetworkManager _network;
  Map<String, dynamic>? _organization;
  final List<Map<String, String>> _documents = [];
  bool _loading = true;
  bool _submitting = false;
  String _documentType = 'commercial_register';

  static const _types = {
    'commercial_register': 'السجل التجاري',
    'tax_card': 'البطاقة الضريبية',
    'national_id': 'بطاقة الرقم القومي',
    'shipping_license': 'ترخيص الشحن',
    'other': 'مستند آخر',
  };

  @override
  void initState() {
    super.initState();
    _network = ServiceLocator.network();
    _load();
  }

  Future<void> _load() async {
    try {
      final response = await _network.get<Map<String, dynamic>>(
        '/organizations/me',
      );
      if (mounted) {
        setState(
          () =>
              _organization = response['organization'] as Map<String, dynamic>?,
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

  Future<void> _pickDocument() async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
      maxWidth: 2200,
    );
    if (picked == null) return;
    setState(() => _submitting = true);
    try {
      final bytes = await picked.readAsBytes();
      final mime =
          picked.mimeType ??
          (picked.name.toLowerCase().endsWith('.png')
              ? 'image/png'
              : 'image/jpeg');
      final response = await _network.post<Map<String, dynamic>>(
        '/upload',
        data: {
          'fileData': 'data:$mime;base64,${base64Encode(bytes)}',
          'fileType': 'image',
          'mimeType': mime,
        },
      );
      final url = (response['media'] as Map)['url']?.toString();
      if (url != null && mounted) {
        setState(
          () => _documents.add({'type': _documentType, 'file_url': url}),
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
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _submit() async {
    if (_documents.isEmpty) return;
    setState(() => _submitting = true);
    try {
      await _network.post<Map<String, dynamic>>(
        '/organizations/me/verification',
        data: {'documents': _documents},
      );
      _documents.clear();
      await _load();
      if (mounted) {
        ErrorHandler.showSecureSnackBar(
          context,
          'تم إرسال المستندات للمراجعة',
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
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status =
        _organization?['verification_status']?.toString() ?? 'unsubmitted';
    final existing =
        _organization?['verification_documents'] as List<dynamic>? ?? const [];
    return Scaffold(
      appBar: AppBar(title: const Text('توثيق المنشأة')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  child: ListTile(
                    leading: Icon(
                      status == 'verified'
                          ? Icons.verified
                          : Icons.policy_outlined,
                    ),
                    title: Text('حالة التوثيق: $status'),
                    subtitle: const Text(
                      'يراجع مدير المنصة المستندات قبل السماح بالنشر والتداول.',
                    ),
                  ),
                ),
                if (existing.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  const Text(
                    'المستندات الحالية',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  ...existing.map((raw) {
                    final document = raw as Map;
                    return ListTile(
                      leading: const Icon(Icons.description_outlined),
                      title: Text(
                        _types[document['type']] ??
                            document['type']?.toString() ??
                            '',
                      ),
                      subtitle: Text(
                        document['status']?.toString() ?? 'pending',
                      ),
                    );
                  }),
                ],
                if (status != 'verified') ...[
                  const Divider(height: 32),
                  DropdownButtonFormField<String>(
                    initialValue: _documentType,
                    decoration: const InputDecoration(labelText: 'نوع المستند'),
                    items: _types.entries
                        .map(
                          (entry) => DropdownMenuItem(
                            value: entry.key,
                            child: Text(entry.value),
                          ),
                        )
                        .toList(),
                    onChanged: (value) =>
                        setState(() => _documentType = value ?? _documentType),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: _submitting ? null : _pickDocument,
                    icon: const Icon(Icons.upload_file),
                    label: const Text('اختيار صورة المستند ورفعها'),
                  ),
                  ..._documents.asMap().entries.map(
                    (entry) => ListTile(
                      leading: const Icon(
                        Icons.check_circle_outline,
                        color: Colors.green,
                      ),
                      title: Text(_types[entry.value['type']] ?? ''),
                      trailing: IconButton(
                        onPressed: () =>
                            setState(() => _documents.removeAt(entry.key)),
                        icon: const Icon(Icons.close),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: _submitting || _documents.isEmpty
                        ? null
                        : _submit,
                    child: _submitting
                        ? const CircularProgressIndicator()
                        : const Text('إرسال للمراجعة'),
                  ),
                ],
              ],
            ),
    );
  }
}
