import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Native Screen Shield Security Helper wrapping `FLAG_SECURE`.
/// Blocks screenshots and screen recording on payment & sensitive checkout screens.
class ScreenSecurityHelper {
  static const MethodChannel _channel = MethodChannel(
    'com.sealsapp.security/screen_shield',
  );

  /// Enables screenshot & screen recording blocking
  static Future<void> enableScreenSecurity() async {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      try {
        await _channel.invokeMethod('enableSecure');
      } catch (e) {
        debugPrint('ScreenSecurityHelper enableSecure error: $e');
      }
    }
  }

  /// Disables screenshot & screen recording blocking
  static Future<void> disableScreenSecurity() async {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      try {
        await _channel.invokeMethod('disableSecure');
      } catch (e) {
        debugPrint('ScreenSecurityHelper disableSecure error: $e');
      }
    }
  }
}
