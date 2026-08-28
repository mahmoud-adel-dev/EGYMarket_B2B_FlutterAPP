import 'package:flutter/material.dart';
import 'package:easy_localization/easy_localization.dart';
import '../theme/app_theme.dart';
import '../utils/price_formatter.dart';

/// Unified error/empty state with retry. Replaces the ~8 divergent copies of
/// "center column + icon + message + retry button" scattered across screens.
class ErrorRetryView extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;
  final String? retryLabel;
  final IconData icon;
  final bool isEmptyState;

  const ErrorRetryView({
    super.key,
    required this.message,
    this.onRetry,
    this.retryLabel,
    this.icon = Icons.error_outline_rounded,
    this.isEmptyState = false,
  });

  factory ErrorRetryView.empty({
    String? message,
    IconData icon = Icons.inbox_outlined,
  }) {
    return ErrorRetryView(
      message: message ?? tr('no_data_to_show'),
      icon: icon,
      isEmptyState: true,
    );
  }

  @override
  Widget build(BuildContext context) {
    final color = isEmptyState ? AppColors.textSecondary : AppColors.error;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 52, color: color),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.bodyLarge?.copyWith(color: AppColors.textSecondary),
            ),
            if (!isEmptyState && onRetry != null) ...[
              const SizedBox(height: 20),
              FilledButton.tonalIcon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh_rounded),
                label: Text(retryLabel ?? tr('retry')),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Formats a piasters amount for display — thin wrapper kept so screens have one
/// import for money display (see [PriceFormatter]).
String formatEgp(num piasters) => PriceFormatter.egp(piasters);
