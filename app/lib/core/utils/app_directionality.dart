import 'package:flutter/material.dart';

/// Directionality rules shared by bilingual UI components.
///
/// Layout should still use Flutter's directional primitives such as
/// [EdgeInsetsDirectional], [AlignmentDirectional], and [PositionedDirectional].
/// This helper covers the two cases where the ambient direction is not enough:
/// Latin-only tracking and machine-readable form values.
abstract final class AppDirectionality {
  static bool isRtl(BuildContext context) =>
      Directionality.of(context) == TextDirection.rtl;

  /// Arabic is a connected script, so Latin-style character tracking must not
  /// be applied to localized labels.
  static double localizedLetterSpacing(
    BuildContext context,
    double ltrSpacing,
  ) => isRtl(context) ? 0 : ltrSpacing;

  /// Email addresses, phone numbers, URLs, numeric identifiers and passwords
  /// remain left-to-right even when their surrounding form is Arabic.
  static TextDirection? inputTextDirection({
    required TextInputType keyboardType,
    bool obscureText = false,
  }) {
    if (obscureText ||
        keyboardType == TextInputType.emailAddress ||
        keyboardType == TextInputType.phone ||
        keyboardType == TextInputType.url ||
        keyboardType.index == TextInputType.number.index ||
        keyboardType == TextInputType.datetime ||
        keyboardType == TextInputType.visiblePassword) {
      return TextDirection.ltr;
    }
    return null;
  }
}
