import 'package:flutter/material.dart';
import 'network_exception.dart';

/// Global Error Handler Utility.
/// Translates raw backend exceptions & error codes into secure, human-readable user messages.
class ErrorHandler {
  /// Converts any dynamic error into a sanitized, user-friendly string.
  static String getUserFriendlyMessage(dynamic error) {
    if (error is NetworkException) {
      return _mapNetworkExceptionToMessage(error);
    }

    if (error is Exception) {
      return 'An unexpected error occurred. Please try again.';
    }

    return error?.toString() ?? 'An unknown error occurred.';
  }

  static String _mapNetworkExceptionToMessage(NetworkException exception) {
    // 1. Check for specific backend business logic error codes or server messages first
    if (exception.data is Map<String, dynamic>) {
      final code = exception.data['code']?.toString() ?? '';
      final codeMsg = _translateBackendErrorCode(code);
      if (codeMsg != null) return codeMsg;

      final serverMsg = exception.data['message']?.toString();
      if (serverMsg != null &&
          serverMsg.isNotEmpty &&
          serverMsg != 'Server Error') {
        return serverMsg;
      }
    }

    if (exception.message.isNotEmpty &&
        !exception.message.contains('DioException') &&
        !exception.message.contains('SocketException')) {
      return exception.message;
    }

    // 2. Fallback to exception category handling
    switch (exception.type) {
      case NetworkExceptionType.timeout:
        return 'Connection timed out. Please check your internet connection.';
      case NetworkExceptionType.sslPinningFailed:
        return 'Security check failed. Untrusted network or connection blocked.';
      case NetworkExceptionType.unauthorized:
        return 'Session expired. Please log in again.';
      case NetworkExceptionType.paymentRequired:
        return 'يجب تأكيد رسوم المنصة أولًا لإتاحة متابعة الطلب.';
      case NetworkExceptionType.forbidden:
        return 'You do not have permission to perform this action.';
      case NetworkExceptionType.notFound:
        return 'The requested resource was not found.';
      case NetworkExceptionType.serverError:
        return 'Server unavailable. Our team has been notified.';
      case NetworkExceptionType.noInternet:
        return 'Unable to reach the service. Check your connection and try again.';
      case NetworkExceptionType.badResponse:
      case NetworkExceptionType.cancelled:
      case NetworkExceptionType.unknown:
        return exception.message.isNotEmpty
            ? exception.message
            : 'Operation failed. Please try again later.';
    }
  }

  /// Maps backend error code strings to secure user-friendly messages.
  static String? _translateBackendErrorCode(String code) {
    switch (code.toUpperCase()) {
      case 'ERR_INVALID_CREDENTIALS':
      case 'INVALID_CREDENTIALS':
        return 'Invalid email/phone or password. Please try again.';

      case 'ERR_USER_EXISTS':
      case 'USER_ALREADY_EXISTS':
        return 'An account with this email/phone already exists.';

      case 'ERR_USER_NOT_FOUND':
        return 'Account not found. Please register first.';

      case 'ERR_ACCOUNT_DISABLED':
      case 'ACCOUNT_SUSPENDED':
        return 'Your account has been suspended. Contact B2B support.';

      case 'ERR_INVALID_ROLE':
        return 'Invalid user role selected.';

      case 'ERR_TOKEN_EXPIRED':
        return 'Your session has expired. Please log in again.';

      case 'PLATFORM_FEE_REQUIRED':
        return 'يجب تأكيد رسوم المنصة أولًا لإتاحة متابعة الطلب.';
      case 'ORDER_PARTICIPANT_REQUIRED':
        return 'هذه المحادثة متاحة فقط لأطراف الطلب المتعاقدين.';
      case 'SHIPPER_NOT_ASSIGNED':
        return 'لا يمكن إلا لشركة الشحن المعيّنة تحديث هذه الشحنة.';
      case 'TRACKING_EVENT_NOT_ALLOWED':
        return 'يمكن إضافة محطات المتابعة أثناء وجود الشحنة في الطريق فقط.';
      case 'ORG_PERMISSION_REQUIRED':
        return 'يتطلب هذا الإجراء صلاحية مالك أو مدير الحساب.';

      default:
        return null;
    }
  }

  /// Helper to display a secure, styled SnackBar across screens.
  static void showSecureSnackBar(
    BuildContext context,
    String message, {
    bool isError = true,
  }) {
    ScaffoldMessenger.of(context).clearSnackBars();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(
              isError ? Icons.error_outline : Icons.check_circle_outline,
              color: Colors.white,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w500,
                  fontSize: 14,
                ),
              ),
            ),
          ],
        ),
        backgroundColor: isError ? Colors.red[800] : Colors.green[800],
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        duration: const Duration(seconds: 4),
      ),
    );
  }
}
