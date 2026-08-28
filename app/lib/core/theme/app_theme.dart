import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_tokens.dart';

abstract final class AppColors {
  static const navy = Color(0xFF0B2A3D);
  static const primary = Color(0xFF0F766E);
  static const primaryBright = Color(0xFF14B8A6);
  static const accent = Color(0xFFF59E0B);
  static const background = Color(0xFFF4F7F9);
  static const surface = Color(0xFFFFFFFF);
  static const ink = Color(0xFF102A43);
  static const muted = Color(0xFF61758A);
  static const border = Color(0xFFDDE7EC);
  static const success = Color(0xFF15803D);
  static const danger = Color(0xFFDC2626);

  // Semantic aliases — prefer these names in feature code so intent is explicit.
  static const warning = Color(0xFFD97706);
  static const textPrimary = ink;
  static const textSecondary = muted;
  static const error = danger;
}

abstract final class AppTheme {
  static ThemeData light({required bool isArabic}) {
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.primary,
        brightness: Brightness.light,
        primary: AppColors.primary,
        secondary: AppColors.primaryBright,
        tertiary: AppColors.accent,
        surface: AppColors.surface,
        error: AppColors.danger,
      ),
    );
    final fontTheme = isArabic
        ? GoogleFonts.cairoTextTheme(base.textTheme)
        : GoogleFonts.interTextTheme(base.textTheme);

    return base.copyWith(
      scaffoldBackgroundColor: AppColors.background,
      canvasColor: AppColors.background,
      textTheme: fontTheme
          .apply(bodyColor: AppColors.ink, displayColor: AppColors.ink)
          .copyWith(
            headlineLarge: fontTheme.headlineLarge?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: isArabic ? 0 : -0.7,
            ),
            headlineMedium: fontTheme.headlineMedium?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: isArabic ? 0 : -0.4,
            ),
            titleLarge: fontTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w700,
            ),
            titleMedium: fontTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
            ),
            bodyMedium: fontTheme.bodyMedium?.copyWith(height: 1.45),
          ),
      appBarTheme: AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.ink,
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
        titleTextStyle: fontTheme.titleLarge?.copyWith(
          color: AppColors.ink,
          fontWeight: FontWeight.w800,
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.border),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.border,
        thickness: 1,
        space: 1,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        labelStyle: const TextStyle(color: AppColors.muted),
        hintStyle: const TextStyle(color: Color(0xFF8EA0AF)),
        prefixIconColor: AppColors.muted,
        suffixIconColor: AppColors.muted,
        contentPadding: AppInsets.field,
        border: OutlineInputBorder(
          borderRadius: AppRadius.rMd,
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: AppRadius.rMd,
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: AppRadius.rMd,
          borderSide: const BorderSide(color: AppColors.primary, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: AppRadius.rMd,
          borderSide: const BorderSide(color: AppColors.danger),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          disabledBackgroundColor: const Color(0xFFB8C8CC),
          elevation: 0,
          minimumSize: const Size.square(AppComponentSizes.controlHeight),
          padding: const EdgeInsetsDirectional.symmetric(
            horizontal: 20,
            vertical: 13,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: AppRadius.rMd,
          ),
          textStyle: fontTheme.labelLarge?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          disabledBackgroundColor: const Color(0xFFB8C8CC),
          disabledForegroundColor: Colors.white70,
          elevation: 0,
          minimumSize: const Size.square(AppComponentSizes.controlHeight),
          padding: const EdgeInsetsDirectional.symmetric(
            horizontal: 20,
            vertical: 13,
          ),
          shape: RoundedRectangleBorder(borderRadius: AppRadius.rMd),
          textStyle: fontTheme.labelLarge?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary,
          minimumSize: const Size.square(AppComponentSizes.controlHeight),
          padding: const EdgeInsetsDirectional.symmetric(
            horizontal: 20,
            vertical: 13,
          ),
          side: const BorderSide(color: AppColors.border),
          shape: RoundedRectangleBorder(
            borderRadius: AppRadius.rMd,
          ),
          textStyle: fontTheme.labelLarge?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.primary,
          textStyle: fontTheme.labelLarge?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          foregroundColor: AppColors.ink,
          minimumSize: const Size.square(AppTouchTargets.minimum),
        ),
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        elevation: 2,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: const Color(0xFFE9F4F2),
        selectedColor: const Color(0xFFD3ECE8),
        side: const BorderSide(color: AppColors.border),
        shape: RoundedRectangleBorder(borderRadius: AppRadius.rMd),
        labelStyle: fontTheme.labelMedium?.copyWith(color: AppColors.ink),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.navy,
        contentTextStyle: fontTheme.bodyMedium?.copyWith(color: Colors.white),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: AppRadius.rMd),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.primary,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: AppRadius.rLg),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
        ),
      ),
      listTileTheme: const ListTileThemeData(
        iconColor: AppColors.muted,
        textColor: AppColors.ink,
        contentPadding: AppInsets.listItem,
        minTileHeight: AppTouchTargets.minimum,
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        indicatorColor: AppColors.primary.withValues(alpha: 0.12),
        labelTextStyle: WidgetStatePropertyAll(
          fontTheme.labelSmall?.copyWith(fontWeight: FontWeight.w600),
        ),
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: AppColors.primary,
        unselectedLabelColor: AppColors.muted,
        indicatorColor: AppColors.primary,
        dividerColor: AppColors.border,
        labelStyle: fontTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700),
        unselectedLabelStyle: fontTheme.labelLarge,
      ),
    );
  }
}
