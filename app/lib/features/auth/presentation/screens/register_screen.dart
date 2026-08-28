import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/constants/api_constants.dart';
import '../../../../core/constants/governorates.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../../core/utils/app_directionality.dart';
import '../../data/models/auth_models.dart';
import '../cubit/auth_cubit.dart';
import '../cubit/auth_state.dart';
import '../widgets/role_selector_widget.dart';

/// Canonical Arabic governorate list — the platform standard shared with
/// checkout, shipping rates, and seed data. English names never matched
/// server-side governorate filters.
const List<String> kEgyptianGovernorates = egyptGovernorates;

/// Canonical category interest list. Each entry carries a stable `key` used both
/// for localization (display) and as the canonical value submitted to the backend.
/// The visible label is localized via `l10nKey`; the submitted value stays the
/// canonical English key so catalogue matching is stable across languages.
const List<Map<String, dynamic>> kProductCategories = [
  {
    'key': 'Electronics',
    'l10nKey': 'cat_electronics',
    'icon': Icons.computer_rounded,
    'color': Color(0xFF6C63FF),
  },
  {
    'key': 'Fashion',
    'l10nKey': 'cat_fashion',
    'icon': Icons.checkroom_rounded,
    'color': Color(0xFFFF6B9D),
  },
  {
    'key': 'Food & Beverages',
    'l10nKey': 'cat_food_beverages',
    'icon': Icons.restaurant_rounded,
    'color': Color(0xFF4ECDC4),
  },
  {
    'key': 'Home & Living',
    'l10nKey': 'cat_home_living',
    'icon': Icons.home_rounded,
    'color': Color(0xFFFF9800),
  },
  {
    'key': 'Auto Parts',
    'l10nKey': 'cat_auto_parts',
    'icon': Icons.directions_car_rounded,
    'color': Color(0xFF9C27B0),
  },
  {
    'key': 'Cosmetics',
    'l10nKey': 'cat_cosmetics',
    'icon': Icons.face_retouching_natural,
    'color': Color(0xFFE91E63),
  },
  {
    'key': 'Office Supplies',
    'l10nKey': 'cat_office_supplies',
    'icon': Icons.work_rounded,
    'color': Color(0xFF2196F3),
  },
  {
    'key': 'Toys & Kids',
    'l10nKey': 'cat_toys_kids',
    'icon': Icons.toys_rounded,
    'color': Color(0xFF00BCD4),
  },
  {
    'key': 'Sports',
    'l10nKey': 'cat_sports',
    'icon': Icons.sports_soccer_rounded,
    'color': Color(0xFF4CAF50),
  },
  {
    'key': 'Medical',
    'l10nKey': 'cat_medical',
    'icon': Icons.medical_services_rounded,
    'color': Color(0xFFF44336),
  },
];

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _pageController = PageController();

  late final TextEditingController _nameController;
  late final TextEditingController _businessNameController;
  late final TextEditingController _emailController;
  late final TextEditingController _phoneController;
  late final TextEditingController _passwordController;
  late final TextEditingController _addressController;

  UserRole _selectedRole = UserRole.retailer;
  String _selectedGovernorate = egyptGovernorates.first;
  bool _isPasswordObscured = true;
  bool _acceptedTerms = false;
  final Set<String> _selectedCategories = {};

  Future<void> _openLegalPage(String path) async {
    final apiUrl = ApiConstants.baseUrl;
    final origin = apiUrl.endsWith('/api')
        ? apiUrl.substring(0, apiUrl.length - 4)
        : apiUrl;
    await launchUrl(
      Uri.parse('$origin/$path'),
      mode: LaunchMode.externalApplication,
    );
  }

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController();
    _businessNameController = TextEditingController();
    _emailController = TextEditingController();
    _phoneController = TextEditingController();
    _passwordController = TextEditingController();
    _addressController = TextEditingController();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _businessNameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    _addressController.dispose();
    _pageController.dispose();
    super.dispose();
  }

  void _onRegisterSubmitted() {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    if (!_acceptedTerms) {
      ErrorHandler.showSecureSnackBar(
        context,
        tr('agree_terms_required'),
        isError: true,
      );
      return;
    }

    // If retailer and no categories selected, prompt
    if (_selectedRole == UserRole.retailer && _selectedCategories.isEmpty) {
      ErrorHandler.showSecureSnackBar(
        context,
        tr('select_category_required'),
        isError: true,
      );
      return;
    }

    FocusScope.of(context).unfocus();
    final request = RegisterRequest(
      ownerName: _nameController.text,
      businessName: _businessNameController.text,
      email: _emailController.text,
      phone: _phoneController.text,
      password: _passwordController.text,
      role: _selectedRole,
      governorate: _selectedGovernorate,
      address: _addressController.text.trim().isNotEmpty
          ? _addressController.text.trim()
          : null,
      interestedCategories: _selectedCategories.toList(),
      acceptedTerms: _acceptedTerms,
    );
    context.read<AuthCubit>().register(request);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FA),
      appBar: AppBar(
        backgroundColor: const Color(0xFFF5F6FA),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, color: Color(0xFF1A1D3B)),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(
          tr('register_title'),
          style: const TextStyle(
            color: Color(0xFF1A1D3B),
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      body: BlocListener<AuthCubit, AuthState>(
        listener: (context, state) {
          if (state is AuthErrorState) {
            ErrorHandler.showSecureSnackBar(
              context,
              state.message,
              isError: true,
            );
          } else if (state is RegistrationPendingVerificationState) {
            final message = state.deliveryStatus == 'development_verified'
                ? tr('account_created_auto_verified')
                : state.deliveryStatus == 'sent'
                ? tr('account_created_check_email')
                : tr('account_created_mail_not_configured');
            ErrorHandler.showSecureSnackBar(context, message, isError: false);
            Navigator.of(context).pop();
          }
        },
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
            children: [
              // Role Selector
              _SectionCard(
                title: tr('whats_your_role'),
                child: RoleSelectorWidget(
                  selectedRole: _selectedRole,
                  onRoleChanged: (r) => setState(() => _selectedRole = r),
                ),
              ),
              const SizedBox(height: 12),

              // Personal Info Card
              _SectionCard(
                title: tr('account_information'),
                child: Column(
                  children: [
                    _Field(
                      controller: _nameController,
                      label: tr('owner_name'),
                      icon: Icons.person_outline,
                      validator: (v) => (v?.trim().isEmpty ?? true)
                          ? tr('name_required')
                          : null,
                    ),
                    const SizedBox(height: 12),
                    _Field(
                      controller: _businessNameController,
                      label: tr('company_name'),
                      icon: Icons.business_outlined,
                      validator: (v) => (v?.trim().isEmpty ?? true)
                          ? tr('business_name_required')
                          : null,
                    ),
                    const SizedBox(height: 12),
                    _Field(
                      controller: _emailController,
                      label: tr('business_email'),
                      icon: Icons.email_outlined,
                      keyboard: TextInputType.emailAddress,
                      validator: (v) {
                        if (v?.trim().isEmpty ?? true) {
                          return tr('email_required_reg');
                        }
                        if (!v!.contains('@')) return tr('email_invalid');
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                    _Field(
                      controller: _phoneController,
                      label: tr('phone_number'),
                      icon: Icons.phone_outlined,
                      keyboard: TextInputType.phone,
                      validator: (v) => (v?.trim().isEmpty ?? true)
                          ? tr('phone_required')
                          : null,
                    ),
                    const SizedBox(height: 12),
                    // Password
                    TextFormField(
                      controller: _passwordController,
                      obscureText: _isPasswordObscured,
                      textDirection: AppDirectionality.inputTextDirection(
                        keyboardType: TextInputType.visiblePassword,
                        obscureText: true,
                      ),
                      textInputAction: TextInputAction.done,
                      style: const TextStyle(
                        color: Color(0xFF1A1D3B),
                        fontWeight: FontWeight.w500,
                      ),
                      decoration: InputDecoration(
                        labelText: tr('password'),
                        prefixIcon: const Icon(
                          Icons.lock_outline_rounded,
                          color: Color(0xFF6C63FF),
                          size: 20,
                        ),
                        suffixIcon: GestureDetector(
                          onTap: () => setState(
                            () => _isPasswordObscured = !_isPasswordObscured,
                          ),
                          child: Icon(
                            _isPasswordObscured
                                ? Icons.visibility_off_outlined
                                : Icons.visibility_outlined,
                            color: Colors.grey[400],
                            size: 20,
                          ),
                        ),
                        filled: true,
                        fillColor: const Color(0xFFF5F6FA),
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
                          borderSide: const BorderSide(
                            color: Color(0xFF6C63FF),
                            width: 2,
                          ),
                        ),
                        errorBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(
                            color: Color(0xFFFF6B9D),
                          ),
                        ),
                        focusedErrorBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(
                            color: Color(0xFFFF6B9D),
                            width: 2,
                          ),
                        ),
                      ),
                      validator: (v) {
                        if (v?.isEmpty ?? true) return tr('password_required');
                        if ((v?.length ?? 0) < 8) {
                          return tr('password_min_length_ar');
                        }
                        if (!RegExp(r'[A-Za-z]').hasMatch(v!)) {
                          return tr('password_needs_letter');
                        }
                        if (!RegExp(r'[0-9]').hasMatch(v)) {
                          return tr('password_needs_number');
                        }
                        return null;
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // Location Card
              _SectionCard(
                title: tr('location'),
                child: Column(
                  children: [
                    DropdownButtonFormField<String>(
                      initialValue: _selectedGovernorate,
                      style: const TextStyle(
                        color: Color(0xFF1A1D3B),
                        fontSize: 14,
                      ),
                      decoration: InputDecoration(
                        labelText: tr('governorate'),
                        prefixIcon: const Icon(
                          Icons.location_on_outlined,
                          color: Color(0xFF6C63FF),
                          size: 20,
                        ),
                        filled: true,
                        fillColor: const Color(0xFFF5F6FA),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide.none,
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide.none,
                        ),
                      ),
                      items: kEgyptianGovernorates
                          .map(
                            (g) => DropdownMenuItem(value: g, child: Text(g)),
                          )
                          .toList(),
                      onChanged: (v) {
                        if (v != null) setState(() => _selectedGovernorate = v);
                      },
                    ),
                    const SizedBox(height: 12),
                    _Field(
                      controller: _addressController,
                      label: tr('address'),
                      icon: Icons.home_outlined,
                    ),
                  ],
                ),
              ),

              // Category interests (Retailer only)
              if (_selectedRole == UserRole.retailer) ...[
                const SizedBox(height: 12),
                _SectionCard(
                  title: tr('my_interests'),
                  subtitle: tr('interests_subtitle'),
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: kProductCategories.map((cat) {
                      final key = cat['key'] as String;
                      final label = tr(cat['l10nKey'] as String);
                      final color = cat['color'] as Color;
                      final icon = cat['icon'] as IconData;
                      final isSelected = _selectedCategories.contains(key);
                      return GestureDetector(
                        onTap: () => setState(() {
                          if (isSelected) {
                            _selectedCategories.remove(key);
                          } else {
                            _selectedCategories.add(key);
                          }
                        }),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color: isSelected
                                ? color.withValues(alpha: 0.15)
                                : const Color(0xFFF5F6FA),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: isSelected ? color : Colors.grey[300]!,
                              width: isSelected ? 2 : 1,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                icon,
                                size: 16,
                                color: isSelected ? color : Colors.grey[400],
                              ),
                              const SizedBox(width: 6),
                              Text(
                                label,
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: isSelected
                                      ? FontWeight.w700
                                      : FontWeight.w500,
                                  color: isSelected ? color : Colors.grey[600],
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ],

              const SizedBox(height: 12),
              CheckboxListTile(
                value: _acceptedTerms,
                onChanged: (value) =>
                    setState(() => _acceptedTerms = value ?? false),
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: EdgeInsets.zero,
                title: Wrap(
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      tr('agree_to_terms_prefix'),
                      style: const TextStyle(fontSize: 13),
                    ),
                    TextButton(
                      onPressed: () => _openLegalPage('terms'),
                      child: Text(tr('terms_of_use')),
                    ),
                    Text(
                      tr('agree_to_terms_and'),
                      style: const TextStyle(fontSize: 13),
                    ),
                    TextButton(
                      onPressed: () => _openLegalPage('privacy'),
                      child: Text(tr('privacy_policy')),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              // Submit Button
              BlocBuilder<AuthCubit, AuthState>(
                builder: (context, state) {
                  final isLoading = state is AuthLoading;
                  return Container(
                    height: 54,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(16),
                      gradient: LinearGradient(
                        colors: isLoading
                            ? [Colors.grey[300]!, Colors.grey[300]!]
                            : [
                                const Color(0xFF6C63FF),
                                const Color(0xFF9C8FFF),
                              ],
                      ),
                      boxShadow: isLoading
                          ? []
                          : [
                              BoxShadow(
                                color: const Color(
                                  0xFF6C63FF,
                                ).withValues(alpha: 0.35),
                                blurRadius: 16,
                                offset: const Offset(0, 6),
                              ),
                            ],
                    ),
                    child: ElevatedButton(
                      onPressed: isLoading ? null : _onRegisterSubmitted,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.transparent,
                        shadowColor: Colors.transparent,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                      child: isLoading
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2.5,
                              ),
                            )
                          : Text(
                              tr('register_here').toUpperCase(),
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                                fontSize: 15,
                              ),
                            ),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget child;

  const _SectionCard({required this.title, required this.child, this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [
          BoxShadow(
            color: Color(0x08000000),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w700,
              color: const Color(0xFF1A1D3B),
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 2),
            Text(
              subtitle!,
              style: TextStyle(fontSize: 12, color: Colors.grey[500]),
            ),
          ],
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }
}

class _Field extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final IconData icon;
  final TextInputType keyboard;
  final String? Function(String?)? validator;

  const _Field({
    required this.controller,
    required this.label,
    required this.icon,
    this.keyboard = TextInputType.text,
    this.validator,
  });

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboard,
      textDirection: AppDirectionality.inputTextDirection(
        keyboardType: keyboard,
      ),
      textInputAction: TextInputAction.next,
      style: const TextStyle(
        color: Color(0xFF1A1D3B),
        fontWeight: FontWeight.w500,
      ),
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, color: const Color(0xFF6C63FF), size: 20),
        filled: true,
        fillColor: const Color(0xFFF5F6FA),
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
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFFF6B9D)),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFFF6B9D), width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 14,
        ),
      ),
      validator: validator,
    );
  }
}
