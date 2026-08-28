import 'package:easy_localization/easy_localization.dart';
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
      return tr('err_generic_unexpected');
    }

    return error?.toString() ?? tr('err_unknown');
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
        return tr('err_network_timeout');
      case NetworkExceptionType.sslPinningFailed:
        return tr('err_ssl_pinning');
      case NetworkExceptionType.unauthorized:
        return tr('err_session_expired');
      case NetworkExceptionType.paymentRequired:
        return tr('err_platform_fee');
      case NetworkExceptionType.forbidden:
        return tr('err_forbidden');
      case NetworkExceptionType.notFound:
        return tr('err_not_found');
      case NetworkExceptionType.serverError:
        return tr('err_server_unavailable');
      case NetworkExceptionType.noInternet:
        return tr('err_no_internet_service');
      case NetworkExceptionType.badResponse:
      case NetworkExceptionType.cancelled:
      case NetworkExceptionType.unknown:
        return exception.message.isNotEmpty
            ? exception.message
            : tr('err_operation_failed');
    }
  }

  /// Maps backend error code strings to secure user-friendly messages.
  static String? _translateBackendErrorCode(String code) {
    switch (code.toUpperCase()) {
      case 'ERR_INVALID_CREDENTIALS':
      case 'INVALID_CREDENTIALS':
        return tr('err_invalid_credentials');

      case 'ERR_USER_EXISTS':
      case 'USER_ALREADY_EXISTS':
        return tr('err_user_exists');

      case 'ERR_USER_NOT_FOUND':
        return tr('err_user_not_found');

      case 'ERR_ACCOUNT_DISABLED':
      case 'ACCOUNT_SUSPENDED':
        return tr('err_account_suspended');

      case 'ERR_INVALID_ROLE':
        return tr('err_invalid_role');

      case 'ERR_TOKEN_EXPIRED':
        return tr('err_session_expired');

      case 'PLATFORM_FEE_REQUIRED':
        return tr('err_platform_fee');
      case 'ORDER_PARTICIPANT_REQUIRED':
        return tr('err_chat_participants');
      case 'SHIPPER_NOT_ASSIGNED':
        return tr('err_shipper_not_assigned');
      case 'TRACKING_EVENT_NOT_ALLOWED':
        return tr('err_tracking_not_allowed');
      case 'ORG_PERMISSION_REQUIRED':
        return tr('err_org_permission');

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
