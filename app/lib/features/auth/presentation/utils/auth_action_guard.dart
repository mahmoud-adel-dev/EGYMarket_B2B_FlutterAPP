import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../data/models/auth_models.dart';
import '../cubit/auth_cubit.dart';
import '../cubit/auth_state.dart';
import '../screens/login_screen.dart';

/// Provides a friendly login gate before any protected marketplace mutation.
Future<AuthUserModel?> requireAuthenticatedUser(
  BuildContext context, {
  required String actionLabel,
}) async {
  var state = context.read<AuthCubit>().state;
  if (state is AuthenticatedState) return state.user;

  final shouldLogin = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      icon: const Icon(Icons.lock_person_outlined),
      title: const Text('تسجيل الدخول مطلوب'),
      content: Text(
        'يمكنك تصفح المنصة بحرية، لكن يجب تسجيل الدخول حتى تتمكن من $actionLabel.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, false),
          child: const Text('لاحقًا'),
        ),
        FilledButton.icon(
          onPressed: () => Navigator.pop(dialogContext, true),
          icon: const Icon(Icons.login_rounded),
          label: const Text('تسجيل الدخول'),
        ),
      ],
    ),
  );
  if (shouldLogin != true || !context.mounted) return null;

  await Navigator.of(
    context,
  ).push(MaterialPageRoute(builder: (_) => const LoginScreen()));
  if (!context.mounted) return null;
  state = context.read<AuthCubit>().state;
  return state is AuthenticatedState ? state.user : null;
}

Future<AuthUserModel?> requireBuyer(
  BuildContext context, {
  required String actionLabel,
}) async {
  final user = await requireAuthenticatedUser(
    context,
    actionLabel: actionLabel,
  );
  if (user == null || !context.mounted) return null;
  if (user.role == UserRole.retailer) return user;

  ScaffoldMessenger.of(context).showSnackBar(
    const SnackBar(content: Text('هذه العملية متاحة لحسابات المشترين فقط.')),
  );
  return null;
}
