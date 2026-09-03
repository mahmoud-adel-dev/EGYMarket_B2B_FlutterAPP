import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:seals_app/core/theme/app_theme.dart';
import 'package:seals_app/core/theme/app_tokens.dart';
import 'package:seals_app/core/utils/app_directionality.dart';

void main() {
  group('bilingual directionality', () {
    testWidgets('localized tracking is disabled in RTL only', (tester) async {
      late double rtlSpacing;
      late double ltrSpacing;

      await tester.pumpWidget(
        Directionality(
          textDirection: TextDirection.rtl,
          child: Builder(
            builder: (context) {
              rtlSpacing = AppDirectionality.localizedLetterSpacing(
                context,
                2.5,
              );
              return const SizedBox.shrink();
            },
          ),
        ),
      );
      await tester.pumpWidget(
        Directionality(
          textDirection: TextDirection.ltr,
          child: Builder(
            builder: (context) {
              ltrSpacing = AppDirectionality.localizedLetterSpacing(
                context,
                2.5,
              );
              return const SizedBox.shrink();
            },
          ),
        ),
      );

      expect(rtlSpacing, 0);
      expect(ltrSpacing, 2.5);
    });

    test('machine-readable input values remain LTR', () {
      expect(
        AppDirectionality.inputTextDirection(
          keyboardType: TextInputType.emailAddress,
        ),
        TextDirection.ltr,
      );
      expect(
        AppDirectionality.inputTextDirection(keyboardType: TextInputType.phone),
        TextDirection.ltr,
      );
      expect(
        AppDirectionality.inputTextDirection(
          keyboardType: TextInputType.number,
        ),
        TextDirection.ltr,
      );
      expect(
        AppDirectionality.inputTextDirection(keyboardType: TextInputType.text),
        isNull,
      );
    });
  });

  group('design-system accessibility contract', () {
    test('Arabic typography does not inherit Latin headline tracking', () {
      final testFonts = ThemeData(useMaterial3: true).textTheme;
      final arabic = AppTheme.light(
        isArabic: true,
        fontThemeOverride: testFonts,
      );
      final english = AppTheme.light(
        isArabic: false,
        fontThemeOverride: testFonts,
      );

      expect(arabic.textTheme.headlineLarge?.letterSpacing, 0);
      expect(arabic.textTheme.headlineMedium?.letterSpacing, 0);
      expect(english.textTheme.headlineLarge?.letterSpacing, -0.7);
      expect(english.textTheme.headlineMedium?.letterSpacing, -0.4);
    });

    test('interactive controls keep the 48px minimum touch target', () {
      final theme = AppTheme.light(
        isArabic: false,
        fontThemeOverride: ThemeData(useMaterial3: true).textTheme,
      );
      const states = <WidgetState>{};

      expect(
        theme.elevatedButtonTheme.style?.minimumSize?.resolve(states),
        const Size.square(AppTouchTargets.minimum),
      );
      expect(
        theme.filledButtonTheme.style?.minimumSize?.resolve(states),
        const Size.square(AppTouchTargets.minimum),
      );
      expect(
        theme.outlinedButtonTheme.style?.minimumSize?.resolve(states),
        const Size.square(AppTouchTargets.minimum),
      );
      expect(
        theme.iconButtonTheme.style?.minimumSize?.resolve(states),
        const Size.square(AppTouchTargets.minimum),
      );
      expect(theme.listTileTheme.minTileHeight, AppTouchTargets.minimum);
    });

    test('shared form padding is direction-aware', () {
      final theme = AppTheme.light(
        isArabic: true,
        fontThemeOverride: ThemeData(useMaterial3: true).textTheme,
      );

      expect(
        theme.inputDecorationTheme.contentPadding,
        isA<EdgeInsetsDirectional>(),
      );
      expect(AppInsets.page, isA<EdgeInsetsDirectional>());
      expect(AppInsets.listItem, isA<EdgeInsetsDirectional>());
    });
  });
}
