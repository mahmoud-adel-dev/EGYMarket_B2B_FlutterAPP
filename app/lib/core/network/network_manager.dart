import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../errors/network_exception.dart';
import '../storage/secure_storage_service.dart';
import 'nextauth_cookie_interceptor.dart';
import 'ssl_pinning_config.dart';

/// Contract for NetworkManager adhering to Clean Architecture principle.
abstract class INetworkManager {
  Future<T> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    T Function(dynamic data)? decoder,
    bool requiresAuth = true,
  });

  Future<T> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    T Function(dynamic data)? decoder,
    bool requiresAuth = true,
  });

  Future<T> put<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    T Function(dynamic data)? decoder,
    bool requiresAuth = true,
  });

  Future<T> patch<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    T Function(dynamic data)? decoder,
    bool requiresAuth = true,
  });

  Future<T> delete<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    T Function(dynamic data)? decoder,
    bool requiresAuth = true,
  });
}

/// Secure Network Manager wrapping [Dio] HTTP client.
///
/// Implementations:
/// - Enforces SSL/TLS Certificate Pinning.
/// - Persists and sends the NextAuth cookie session on native platforms.
/// - Scrubs sensitive credentials in logs.
/// - Converts Dio exceptions into domain [NetworkException].
class NetworkManager implements INetworkManager {
  late final Dio _dio;
  final ISecureStorageService _storageService;
  final String baseUrl;

  NetworkManager({
    required this.baseUrl,
    required this._storageService,
    OnUnauthenticatedCallback? onUnauthenticated,
    bool enableSslPinning = true,
    Dio? customDio,
  }) {
    _dio =
        customDio ??
        Dio(
          BaseOptions(
            baseUrl: baseUrl,
            connectTimeout: const Duration(seconds: 15),
            receiveTimeout: const Duration(seconds: 15),
            sendTimeout: const Duration(seconds: 15),
            extra: {'withCredentials': true},
            headers: {'Accept': 'application/json'},
          ),
        );

    // 1. SSL Pinning configuration
    SslPinningConfig.configureSslPinning(_dio, enabled: enableSslPinning);

    // 2. NextAuth cookie session interceptor
    _dio.interceptors.add(
      NextAuthCookieInterceptor(
        storageService: _storageService,
        onUnauthenticated: onUnauthenticated,
      ),
    );

    // 3. Debug Logging Interceptor (Scrubbing sensitive headers)
    if (kDebugMode) {
      _dio.interceptors.add(
        LogInterceptor(
          requestHeader: false,
          requestBody: false,
          responseHeader: false,
          responseBody: false,
          error: true,
          logPrint: (object) {
            final logStr = object.toString();
            debugPrint('[HTTP] $logStr');
          },
        ),
      );
    }
  }

  /// Exposed Dio instance for special operations if required.
  Dio get client => _dio;

  @override
  Future<T> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    T Function(dynamic data)? decoder,
    bool requiresAuth = true,
  }) async {
    return _sendRequest<T>(
      () => _dio.get(
        path,
        queryParameters: queryParameters,
        options: _mergeOptions(options, requiresAuth: requiresAuth),
        cancelToken: cancelToken,
      ),
      decoder: decoder,
    );
  }

  @override
  Future<T> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    T Function(dynamic data)? decoder,
    bool requiresAuth = true,
  }) async {
    return _sendRequest<T>(
      () => _dio.post(
        path,
        data: data,
        queryParameters: queryParameters,
        options: _mergeOptions(options, requiresAuth: requiresAuth),
        cancelToken: cancelToken,
      ),
      decoder: decoder,
    );
  }

  @override
  Future<T> put<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    T Function(dynamic data)? decoder,
    bool requiresAuth = true,
  }) async {
    return _sendRequest<T>(
      () => _dio.put(
        path,
        data: data,
        queryParameters: queryParameters,
        options: _mergeOptions(options, requiresAuth: requiresAuth),
        cancelToken: cancelToken,
      ),
      decoder: decoder,
    );
  }

  @override
  Future<T> patch<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    T Function(dynamic data)? decoder,
    bool requiresAuth = true,
  }) async {
    return _sendRequest<T>(
      () => _dio.patch(
        path,
        data: data,
        queryParameters: queryParameters,
        options: _mergeOptions(options, requiresAuth: requiresAuth),
        cancelToken: cancelToken,
      ),
      decoder: decoder,
    );
  }

  @override
  Future<T> delete<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    T Function(dynamic data)? decoder,
    bool requiresAuth = true,
  }) async {
    return _sendRequest<T>(
      () => _dio.delete(
        path,
        data: data,
        queryParameters: queryParameters,
        options: _mergeOptions(options, requiresAuth: requiresAuth),
        cancelToken: cancelToken,
      ),
      decoder: decoder,
    );
  }

  /// Helper to merge extra request options.
  Options _mergeOptions(Options? options, {required bool requiresAuth}) {
    final opts = options ?? Options();
    opts.extra = {...?opts.extra, kRequiresAuthKey: requiresAuth};
    return opts;
  }

  /// Core request executor with centralized error handling.
  Future<T> _sendRequest<T>(
    Future<Response> Function() requestCall, {
    T Function(dynamic data)? decoder,
  }) async {
    try {
      final response = await requestCall();
      final data = response.data;

      if (decoder != null) {
        return decoder(data);
      }

      return data as T;
    } on DioException catch (dioErr) {
      throw NetworkException.fromDioException(dioErr);
    } catch (e) {
      if (e is NetworkException) rethrow;
      throw NetworkException(
        message: e.toString(),
        type: NetworkExceptionType.unknown,
      );
    }
  }
}
