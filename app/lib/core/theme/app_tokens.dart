import 'package:flutter/material.dart';

/// Design-system spacing scale. All layout gaps/paddings must come from here so
/// screens stay visually consistent and responsive tweaks stay centralized.
abstract final class AppSpacing {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;
  static const double xxxl = 48;
}

/// Direction-aware insets for the layouts repeated across the application.
///
/// Feature widgets should prefer these values (or [EdgeInsetsDirectional])
/// whenever horizontal spacing is not symmetrical. This makes the same widget
/// naturally mirror when the locale changes between English and Arabic.
abstract final class AppInsets {
  static const EdgeInsetsDirectional page = EdgeInsetsDirectional.fromSTEB(
    AppSpacing.lg,
    AppSpacing.lg,
    AppSpacing.lg,
    AppSpacing.xl,
  );
  static const EdgeInsetsDirectional card = EdgeInsetsDirectional.all(
    AppSpacing.lg,
  );
  static const EdgeInsetsDirectional field = EdgeInsetsDirectional.symmetric(
    horizontal: AppSpacing.lg,
    vertical: 15,
  );
  static const EdgeInsetsDirectional listItem =
      EdgeInsetsDirectional.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.md,
      );
}

/// Corner-radius scale.
abstract final class AppRadius {
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 20;
  static const double pill = 999;

  static BorderRadius get rSm => BorderRadius.circular(sm);
  static BorderRadius get rMd => BorderRadius.circular(md);
  static BorderRadius get rLg => BorderRadius.circular(lg);
  static BorderRadius get rXl => BorderRadius.circular(xl);
}

/// Standard animation durations.
abstract final class AppDurations {
  static const Duration fast = Duration(milliseconds: 150);
  static const Duration normal = Duration(milliseconds: 250);
  static const Duration slow = Duration(milliseconds: 400);
}

/// Responsive breakpoints (logical pixels). Aligned with the desktop shell
/// switch in [MainTabNavigationScreen] (>=1024) and two-panel auth (>=900).
abstract final class AppBreakpoints {
  static const double compact = 600;
  static const double medium = 900;
  static const double expanded = 1024;
  static const double wide = 1440;

  static bool isCompact(double width) => width < compact;
  static bool isMedium(double width) => width >= compact && width < expanded;
  static bool isExpanded(double width) => width >= expanded;
}

/// Touch-target accessibility floor per Material guidance.
abstract final class AppTouchTargets {
  static const double minimum = 48;
}

/// Component dimensions which are shared by the application shell and forms.
abstract final class AppComponentSizes {
  static const double controlHeight = AppTouchTargets.minimum;
  static const double icon = 24;
  static const double iconSmall = 20;
}
