import 'package:dio/dio.dart';

/// Clean Architecture Network Exception Domain Wrapper
class NetworkException implements Exception {
  final String message;
  final int? statusCode;
  final dynamic data;
  final NetworkExceptionType type;

  NetworkException({
    required this.message,
    this.statusCode,
    this.data,
    this.type = NetworkExceptionType.unknown,
  });

  factory NetworkException.fromDioException(DioException dioException) {
    switch (dioException.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return NetworkException(
          message: 'Connection timeout. Please check your internet connection.',
          type: NetworkExceptionType.timeout,
        );

      case DioExceptionType.badCertificate:
        return NetworkException(
          message:
              'SSL Certificate Pinning validation failed. Potential MITM attack blocked.',
          type: NetworkExceptionType.sslPinningFailed,
        );

      case DioExceptionType.badResponse:
        final statusCode = dioException.response?.statusCode;
        final responseData = dioException.response?.data;

        String serverMessage = 'Server error occurred.';
        if (responseData is Map<String, dynamic> &&
            responseData.containsKey('message')) {
          serverMessage = responseData['message'].toString();
        }

        if (statusCode == 401) {
          return NetworkException(
            message: 'Unauthorized access. Session expired.',
            statusCode: statusCode,
            data: responseData,
            type: NetworkExceptionType.unauthorized,
          );
        } else if (statusCode == 402) {
          return NetworkException(
            message: serverMessage,
            statusCode: statusCode,
            data: responseData,
            type: NetworkExceptionType.paymentRequired,
          );
        } else if (statusCode == 403) {
          return NetworkException(
            message: 'Access forbidden.',
            statusCode: statusCode,
            data: responseData,
            type: NetworkExceptionType.forbidden,
          );
        } else if (statusCode == 404) {
          return NetworkException(
            message: 'Requested resource not found.',
            statusCode: statusCode,
            data: responseData,
            type: NetworkExceptionType.notFound,
          );
        } else if (statusCode != null && statusCode >= 500) {
          return NetworkException(
            message: 'Internal server error ($statusCode).',
            statusCode: statusCode,
            data: responseData,
            type: NetworkExceptionType.serverError,
          );
        }

        return NetworkException(
          message: serverMessage,
          statusCode: statusCode,
          data: responseData,
          type: NetworkExceptionType.badResponse,
        );

      case DioExceptionType.cancel:
        return NetworkException(
          message: 'Request was cancelled.',
          type: NetworkExceptionType.cancelled,
        );

      case DioExceptionType.connectionError:
        return NetworkException(
          message: 'No internet connection or host unreachable.',
          type: NetworkExceptionType.noInternet,
        );

      case DioExceptionType.unknown:
      default:
        return NetworkException(
          message:
              dioException.message ?? 'An unexpected network error occurred.',
          type: NetworkExceptionType.unknown,
        );
    }
  }

  @override
  String toString() =>
      'NetworkException(type: $type, statusCode: $statusCode, message: $message)';
}

enum NetworkExceptionType {
  timeout,
  sslPinningFailed,
  unauthorized,
  paymentRequired,
  forbidden,
  notFound,
  serverError,
  badResponse,
  cancelled,
  noInternet,
  unknown,
}
