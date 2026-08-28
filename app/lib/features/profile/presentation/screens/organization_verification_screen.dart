import 'dart:convert';

import 'package:easy_localization/easy_localization.dart';
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
  static const _typeValues = [
    'commercial_register',
    'tax_card',
    'national_id',
    'shipping_license',
    'other',
  ];

  String _documentTypeLabel(String? type) {
    switch (type) {
      case 'commercial_register':
        return tr('verify_doc_commercial_register');
      case 'tax_card':
        return tr('verify_doc_tax_card');
      case 'national_id':
        return tr('verify_doc_national_id');
      case 'shipping_license':
        return tr('verify_doc_shipping_license');
      case 'other':
        return tr('verify_doc_other');
      default:
        return type ?? '';
    }
  }

  String _verificationStatusLabel(String status) {
    switch (status) {
      case 'verified':
        return tr('verified');
      case 'pending':
        return tr('verify_status_pending');
      case 'rejected':
        return tr('verify_status_rejected');
      case 'unsubmitted':
        return tr('verify_status_unsubmitted');
      case 'approved':
        return tr('verify_status_approved');
      default:
        return status;
    }
  }

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
          tr('verify_documents_submitted'),
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
      appBar: AppBar(title: Text(tr('verify_title'))),
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
                    title: Text(
                      tr(
                        'verify_status_label',
                        namedArgs: {
                          'status': _verificationStatusLabel(status),
                        },
                      ),
                    ),
                    subtitle: Text(tr('verify_review_note')),
                  ),
                ),
                if (existing.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text(
                    tr('verify_current_documents'),
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  ...existing.map((raw) {
                    final document = raw as Map;
                    return ListTile(
                      leading: const Icon(Icons.description_outlined),
                      title: Text(
                        _documentTypeLabel(document['type']?.toString()),
                      ),
                      subtitle: Text(
                        _verificationStatusLabel(
                          document['status']?.toString() ?? 'pending',
                        ),
                      ),
                    );
                  }),
                ],
                if (status != 'verified') ...[
                  const Divider(height: 32),
                  DropdownButtonFormField<String>(
                    initialValue: _documentType,
                    decoration: InputDecoration(labelText: tr('verify_doc_type')),
                    items: _typeValues
                        .map(
                          (value) => DropdownMenuItem(
                            value: value,
                            child: Text(_documentTypeLabel(value)),
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
                    label: Text(tr('verify_pick_document')),
                  ),
                  ..._documents.asMap().entries.map(
                    (entry) => ListTile(
                      leading: const Icon(
                        Icons.check_circle_outline,
                        color: Colors.green,
                      ),
                      title: Text(
                        _documentTypeLabel(entry.value['type']?.toString()),
                      ),
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
                        : Text(tr('verify_submit_review')),
                  ),
                ],
              ],
            ),
    );
  }
}
