import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:easy_localization/easy_localization.dart';

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
      title: Text(tr('sign_in_required')),
      content: Text(
        tr('login_required_body', namedArgs: {'action': actionLabel}),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, false),
          child: Text(tr('later')),
        ),
        FilledButton.icon(
          onPressed: () => Navigator.pop(dialogContext, true),
          icon: const Icon(Icons.login_rounded),
          label: Text(tr('sign_in')),
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

  ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text(tr('buyer_only_action'))));
  return null;
}
