import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/errors/error_handler.dart';
import '../../../../core/utils/app_directionality.dart';
import '../../../../core/theme/app_theme.dart';
import '../../data/models/auth_models.dart';
import '../cubit/auth_cubit.dart';
import '../cubit/auth_state.dart';
import '../widgets/role_selector_widget.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen>
    with SingleTickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _emailOrPhoneController;
  late final TextEditingController _passwordController;
  late final AnimationController _animController;
  late final Animation<double> _fadeAnim;
  late final Animation<Offset> _slideAnim;
  bool _isPasswordObscured = true;
  bool _isResendingVerification = false;

  @override
  void initState() {
    super.initState();
    _emailOrPhoneController = TextEditingController();
    _passwordController = TextEditingController();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _fadeAnim = CurvedAnimation(parent: _animController, curve: Curves.easeOut);
    _slideAnim = Tween<Offset>(begin: const Offset(0, 0.08), end: Offset.zero)
        .animate(
          CurvedAnimation(parent: _animController, curve: Curves.easeOutCubic),
        );
    _animController.forward();
  }

  @override
  void dispose() {
    _emailOrPhoneController.dispose();
    _passwordController.dispose();
    _animController.dispose();
    super.dispose();
  }

  void _onLoginSubmitted() {
    if (_formKey.currentState?.validate() ?? false) {
      FocusScope.of(context).unfocus();
      context.read<AuthCubit>().login(
        LoginRequest(
          email: _emailOrPhoneController.text,
          password: _passwordController.text,
        ),
      );
    }
  }

  Future<void> _resendVerification() async {
    final email = _emailOrPhoneController.text.trim().toLowerCase();
    if (email.isEmpty || !email.contains('@')) {
      ErrorHandler.showSecureSnackBar(
        context,
        tr('resend_email_first'),
        isError: true,
      );
      return;
    }
    setState(() => _isResendingVerification = true);
    try {
      final verifiedInDevelopment = await context
          .read<AuthCubit>()
          .resendVerification(email);
      if (!mounted) return;
      ErrorHandler.showSecureSnackBar(
        context,
        verifiedInDevelopment
            ? tr('resend_verified_in_dev')
            : tr('resend_sent'),
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
      if (mounted) setState(() => _isResendingVerification = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: BlocListener<AuthCubit, AuthState>(
        listener: (context, state) {
          if (state is AuthErrorState) {
            ErrorHandler.showSecureSnackBar(
              context,
              state.message,
              isError: true,
            );
          } else if (state is AuthenticatedState) {
            ErrorHandler.showSecureSnackBar(
              context,
              tr(
                'welcome_back',
                namedArgs: {
                  'name': state.user.name,
                  'role': roleLabel(state.user.role),
                },
              ),
              isError: false,
            );
            if (Navigator.of(context).canPop()) Navigator.of(context).pop();
          }
        },
        child: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final isWide = constraints.maxWidth >= 900;
              return Row(
                children: [
                  if (isWide)
                    Expanded(
                      flex: 11,
                      child: _LoginValuePanel(),
                    ),
                  Expanded(
                    flex: isWide ? 10 : 1,
                    child: Stack(
                      children: [
                        PositionedDirectional(
                          top: 12,
                          start: 12,
                          child: IconButton.filledTonal(
                            onPressed: () => Navigator.of(context).maybePop(),
                            tooltip: MaterialLocalizations.of(
                              context,
                            ).backButtonTooltip,
                            icon: const Icon(Icons.close_rounded),
                          ),
                        ),
                        Center(
                          child: SingleChildScrollView(
                            padding: EdgeInsets.symmetric(
                              horizontal: isWide ? 56 : 24,
                              vertical: 32,
                            ),
                            child: ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 470),
                              child: FadeTransition(
                                opacity: _fadeAnim,
                                child: SlideTransition(
                                  position: _slideAnim,
                                  child: _buildLoginForm(
                                    context,
                                    showBrand: !isWide,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildLoginForm(BuildContext context, {required bool showBrand}) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (showBrand) ...[
            Align(
              child: Container(
                width: 58,
                height: 58,
                decoration: BoxDecoration(
                  color: AppColors.navy,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Icon(
                  Icons.handshake_rounded,
                  size: 30,
                  color: Colors.white,
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
          Text(
            tr('login_title'),
            textAlign: TextAlign.center,
            style: Theme.of(
              context,
            ).textTheme.headlineMedium?.copyWith(fontSize: 29),
          ),
          const SizedBox(height: 8),
          Text(
            tr('login_subtitle'),
            textAlign: TextAlign.center,
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: AppColors.muted),
          ),
          const SizedBox(height: 30),
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.border),
              boxShadow: [
                BoxShadow(
                  color: AppColors.navy.withValues(alpha: 0.06),
                  blurRadius: 30,
                  offset: const Offset(0, 12),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _ModernField(
                  controller: _emailOrPhoneController,
                  label: tr('email_or_phone'),
                  icon: Icons.person_outline_rounded,
                  keyboardType: TextInputType.emailAddress,
                  action: TextInputAction.next,
                  validator: (value) => value == null || value.trim().isEmpty
                      ? tr('email_required')
                      : null,
                ),
                const SizedBox(height: 15),
                _ModernField(
                  controller: _passwordController,
                  label: tr('password'),
                  icon: Icons.lock_outline_rounded,
                  obscureText: _isPasswordObscured,
                  action: TextInputAction.done,
                  onSubmitted: (_) => _onLoginSubmitted(),
                  suffix: IconButton(
                    onPressed: () => setState(
                      () => _isPasswordObscured = !_isPasswordObscured,
                    ),
                    icon: Icon(
                      _isPasswordObscured
                          ? Icons.visibility_off_outlined
                          : Icons.visibility_outlined,
                      size: 20,
                    ),
                  ),
                  validator: (value) {
                    if (value == null || value.isEmpty) {
                      return tr('password_required');
                    }
                    if (value.length < 8) {
                      return tr('password_min_length');
                    }
                    return null;
                  },
                ),
                Align(
                  alignment: AlignmentDirectional.centerEnd,
                  child: TextButton.icon(
                    onPressed: _isResendingVerification
                        ? null
                        : _resendVerification,
                    icon: _isResendingVerification
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(
                            Icons.mark_email_unread_outlined,
                            size: 17,
                          ),
                    label: Text(tr('resend_verification')),
                  ),
                ),
                const SizedBox(height: 22),
                BlocBuilder<AuthCubit, AuthState>(
                  builder: (context, state) {
                    final loading = state is AuthLoading;
                    return ElevatedButton(
                      onPressed: loading ? null : _onLoginSubmitted,
                      child: loading
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2.4,
                              ),
                            )
                          : Text(tr('sign_in')),
                    );
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Wrap(
            alignment: WrapAlignment.center,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                tr('dont_have_account'),
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: AppColors.muted),
              ),
              TextButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const RegisterScreen()),
                ),
                child: Text(tr('register_here')),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _LoginValuePanel extends StatelessWidget {
  const _LoginValuePanel();

  @override
  Widget build(BuildContext context) {
    final features = [
      (tr('value_suppliers'), tr('value_suppliers_desc')),
      (tr('value_payments'), tr('value_payments_desc')),
      (tr('value_workspace'), tr('value_workspace_desc')),
    ];
    return ColoredBox(
      color: AppColors.navy,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 64, vertical: 54),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: const Icon(
                    Icons.handshake_rounded,
                    color: AppColors.navy,
                  ),
                ),
                const SizedBox(width: 13),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'SEALS',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                        fontSize: 22,
                        letterSpacing: 1.2,
                      ),
                    ),
                    Text(
                      tr('b2b_marketplace'),
                      style: const TextStyle(
                        color: Colors.white54,
                        fontSize: 9,
                        letterSpacing: 1.3,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.primaryBright.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: AppColors.primaryBright.withValues(alpha: 0.35),
                ),
              ),
              child: Text(
                tr('value_tagline'),
                style: const TextStyle(
                  color: AppColors.primaryBright,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              tr('value_closing_line'),
              style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                height: 1.35,
                fontSize: 38,
              ),
            ),
            const SizedBox(height: 34),
            ...features.map(
              (feature) => Padding(
                padding: const EdgeInsets.only(bottom: 22),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 30,
                      height: 30,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(9),
                      ),
                      child: const Icon(
                        Icons.check_rounded,
                        color: AppColors.primaryBright,
                        size: 18,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            feature.$1,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            feature.$2,
                            style: const TextStyle(
                              color: Colors.white60,
                              height: 1.5,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const Spacer(),
            Text(
              'SEALS © ${DateTime.now().year}',
              style: const TextStyle(color: Colors.white38, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}

class _ModernField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final IconData icon;
  final TextInputType keyboardType;
  final TextInputAction action;
  final bool obscureText;
  final Widget? suffix;
  final void Function(String)? onSubmitted;
  final String? Function(String?)? validator;

  const _ModernField({
    required this.controller,
    required this.label,
    required this.icon,
    this.keyboardType = TextInputType.text,
    this.action = TextInputAction.next,
    this.obscureText = false,
    this.suffix,
    this.onSubmitted,
    this.validator,
  });

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      textDirection: AppDirectionality.inputTextDirection(
        keyboardType: keyboardType,
        obscureText: obscureText,
      ),
      textInputAction: action,
      obscureText: obscureText,
      onFieldSubmitted: onSubmitted,
      style: const TextStyle(color: AppColors.ink, fontWeight: FontWeight.w500),
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, color: AppColors.primary, size: 20),
        suffixIcon: suffix,
      ),
      validator: validator,
    );
  }
}
