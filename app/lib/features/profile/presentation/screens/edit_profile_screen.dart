import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/di/service_locator.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../../core/network/network_manager.dart';
import '../../data/models/profile_models.dart';
import '../cubit/profile_settings_cubit.dart';

class EditProfileScreen extends StatefulWidget {
  final ProfileModel profile;

  const EditProfileScreen({super.key, required this.profile});

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  bool _isSaving = false;
  late final INetworkManager _network;
  XFile? _avatarFile;
  XFile? _coverFile;

  late final TextEditingController _nameCtrl;
  late final TextEditingController _phoneCtrl;
  late final TextEditingController _avatarCtrl;
  late final TextEditingController _governorateCtrl;
  late final TextEditingController _addressCtrl;

  late final TextEditingController _businessNameCtrl;
  late final TextEditingController _businessDescCtrl;
  late final TextEditingController _coverCtrl;
  late final TextEditingController _whatsappCtrl;
  late final TextEditingController _businessEmailCtrl;

  @override
  void initState() {
    super.initState();
    _network = ServiceLocator.network();
    final p = widget.profile;
    _nameCtrl = TextEditingController(text: p.name);
    _phoneCtrl = TextEditingController(text: p.phone);
    _avatarCtrl = TextEditingController(text: p.avatarUrl ?? '');
    _governorateCtrl = TextEditingController(
      text: p.location?.governorate ?? '',
    );
    _addressCtrl = TextEditingController(text: p.location?.address ?? '');
    _businessNameCtrl = TextEditingController(text: p.businessName ?? '');
    _businessDescCtrl = TextEditingController(
      text: p.businessDescription ?? '',
    );
    _coverCtrl = TextEditingController(text: p.coverUrl ?? '');
    _whatsappCtrl = TextEditingController(
      text: p.contactMethods?.whatsapp ?? '',
    );
    _businessEmailCtrl = TextEditingController(
      text: p.contactMethods?.email ?? '',
    );

    // Add listeners to rebuild for image preview updates
    _avatarCtrl.addListener(() => setState(() {}));
    _coverCtrl.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _avatarCtrl.dispose();
    _governorateCtrl.dispose();
    _addressCtrl.dispose();
    _businessNameCtrl.dispose();
    _businessDescCtrl.dispose();
    _coverCtrl.dispose();
    _whatsappCtrl.dispose();
    _businessEmailCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final profileCubit = context.read<ProfileSettingsCubit>();
    setState(() => _isSaving = true);
    try {
      if (_avatarFile != null) {
        _avatarCtrl.text = await _uploadImage(_avatarFile!);
      }
      if (_coverFile != null) {
        _coverCtrl.text = await _uploadImage(_coverFile!);
      }
      final data = <String, dynamic>{
        'name': _nameCtrl.text.trim(),
        'phone': _phoneCtrl.text.trim(),
        'avatar_url': _avatarCtrl.text.trim(),
        'location': {
          'governorate': _governorateCtrl.text.trim(),
          if (_addressCtrl.text.trim().isNotEmpty)
            'address': _addressCtrl.text.trim(),
        },
        'business_name': _businessNameCtrl.text.trim(),
        'business_description': _businessDescCtrl.text.trim(),
        'cover_url': _coverCtrl.text.trim(),
        'contact_methods': {
          'phone': _phoneCtrl.text.trim(),
          'whatsapp': _whatsappCtrl.text.trim(),
          'email': _businessEmailCtrl.text.trim(),
        },
      };
      await profileCubit.updateProfile(data);
      if (mounted && profileCubit.state is ProfileSettingsUpdateSuccess) {
        Navigator.of(context).pop();
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
      if (mounted) setState(() => _isSaving = false);
    }
  }

  Future<String> _uploadImage(XFile file) async {
    final bytes = await file.readAsBytes();
    final mime =
        file.mimeType ??
        (file.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
    final response = await _network.post<Map<String, dynamic>>(
      '/upload',
      data: {
        'fileData': 'data:$mime;base64,${base64Encode(bytes)}',
        'fileType': 'image',
        'mimeType': mime,
      },
    );
    final url = (response['media'] as Map<String, dynamic>?)?['url']
        ?.toString();
    if (url == null || url.isEmpty) {
      throw StateError('Image upload did not return a URL');
    }
    return url;
  }

  Future<void> _pickImage({required bool isAvatar}) async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
      maxWidth: isAvatar ? 1200 : 2200,
    );
    if (picked == null || !mounted) return;
    setState(() {
      if (isAvatar) {
        _avatarFile = picked;
      } else {
        _coverFile = picked;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FA),
      appBar: AppBar(
        backgroundColor: const Color(0xFFF5F6FA),
        elevation: 0,
        title: const Text(
          'Edit Profile',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            color: Color(0xFF1A1D3B),
          ),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, color: Color(0xFF1A1D3B)),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          if (_isSaving)
            const Padding(
              padding: EdgeInsets.all(16),
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Color(0xFF6C63FF),
                ),
              ),
            )
          else
            TextButton(
              onPressed: _save,
              child: const Text(
                'Save',
                style: TextStyle(
                  color: Color(0xFF6C63FF),
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                ),
              ),
            ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            _sectionLabel('Personal Information'),
            _field(
              _nameCtrl,
              'Full Name',
              Icons.person_outline,
              required: true,
            ),
            _field(
              _phoneCtrl,
              'Phone Number',
              Icons.phone_outlined,
              required: true,
              keyboard: TextInputType.phone,
            ),
            _imageField(
              _avatarCtrl,
              'رابط الصورة الشخصية',
              Icons.account_circle_outlined,
              isAvatar: true,
            ),
            _imageField(
              _coverCtrl,
              'رابط صورة الغلاف',
              Icons.panorama_outlined,
              isAvatar: false,
            ),

            _sectionLabel('Location'),
            _field(
              _governorateCtrl,
              'Governorate',
              Icons.location_city_outlined,
              required: true,
            ),
            _field(
              _addressCtrl,
              'Street Address (optional)',
              Icons.home_outlined,
            ),

            ...[
              _sectionLabel('Business Information'),
              _field(
                _businessNameCtrl,
                'Business Name',
                Icons.storefront_outlined,
                required: true,
              ),
              _field(
                _businessDescCtrl,
                'Business Description',
                Icons.description_outlined,
                maxLines: 3,
              ),
              _sectionLabel('Business Contact'),
              _field(
                _whatsappCtrl,
                'WhatsApp Number',
                Icons.chat_bubble_outline,
                keyboard: TextInputType.phone,
              ),
              _field(
                _businessEmailCtrl,
                'Business Email',
                Icons.alternate_email_rounded,
                keyboard: TextInputType.emailAddress,
              ),
            ],

            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              height: 54,
              child: ElevatedButton(
                onPressed: _isSaving ? null : _save,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF6C63FF),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                  textStyle: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                child: _isSaving
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2,
                        ),
                      )
                    : const Text('Save Changes'),
              ),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _sectionLabel(String text) => Padding(
    padding: const EdgeInsets.only(top: 24, bottom: 12),
    child: Text(
      text.toUpperCase(),
      style: const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w700,
        color: Color(0xFF64748B),
        letterSpacing: 1,
      ),
    ),
  );

  Widget _field(
    TextEditingController ctrl,
    String label,
    IconData icon, {
    bool required = false,
    int maxLines = 1,
    TextInputType keyboard = TextInputType.text,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: TextFormField(
        controller: ctrl,
        maxLines: maxLines,
        keyboardType: keyboard,
        decoration: InputDecoration(
          labelText: label,
          prefixIcon: Icon(icon, color: const Color(0xFF6C63FF), size: 20),
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide.none,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide.none,
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: Color(0xFF6C63FF), width: 2),
          ),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 16,
          ),
        ),
        validator: required
            ? (v) =>
                  (v == null || v.trim().isEmpty) ? '$label is required' : null
            : null,
      ),
    );
  }

  Widget _imageField(
    TextEditingController ctrl,
    String label,
    IconData icon, {
    required bool isAvatar,
  }) {
    final hasImage = ctrl.text.trim().isNotEmpty;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _field(ctrl, label, icon),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _isSaving
                  ? null
                  : () => _pickImage(isAvatar: isAvatar),
              icon: const Icon(Icons.photo_library_outlined),
              label: Text(
                (isAvatar ? _avatarFile : _coverFile) == null
                    ? (isAvatar ? 'اختيار صورة شخصية' : 'اختيار صورة غلاف')
                    : 'تم اختيار ${(isAvatar ? _avatarFile : _coverFile)!.name}',
              ),
            ),
          ),
          if (hasImage)
            Container(
              margin: const EdgeInsets.only(top: 4, bottom: 8),
              height: isAvatar ? 80 : 120,
              width: isAvatar ? 80 : double.infinity,
              decoration: BoxDecoration(
                color: Colors.grey[200],
                borderRadius: BorderRadius.circular(isAvatar ? 40 : 16),
                image: DecorationImage(
                  image: NetworkImage(ctrl.text.trim()),
                  fit: BoxFit.cover,
                  onError: (_, _) => const Icon(
                    Icons.broken_image,
                  ), // handled internally by DecorationImage, but safe
                ),
              ),
              child: Image.network(
                ctrl.text.trim(),
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => Center(
                  child: Icon(
                    Icons.broken_image,
                    color: Colors.grey[400],
                    size: 32,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
