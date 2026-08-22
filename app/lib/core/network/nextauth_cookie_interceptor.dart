import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../storage/secure_storage_service.dart';

const String kRequiresAuthKey = 'requiresAuth';
typedef OnUnauthenticatedCallback = void Function();

/// Merges only NextAuth/Auth.js cookies and applies logout/expiry headers.
/// Kept pure so native cookie handling can be regression tested without I/O.
Map<String, String> mergeNextAuthCookies(
  Map<String, String> existing,
  List<String> setCookieHeaders,
) {
  final cookies = Map<String, String>.from(existing);
  for (final header in setCookieHeaders) {
    final firstPart = header.split(';').first.trim();
    final separator = firstPart.indexOf('=');
    if (separator <= 0) continue;
    final name = firstPart.substring(0, separator);
    final value = firstPart.substring(separator + 1);
    if (!name.contains('next-auth') && !name.contains('authjs')) continue;
    final expired =
        value.isEmpty ||
        RegExp(r'max-age\s*=\s*0', caseSensitive: false).hasMatch(header) ||
        RegExp(
          r'expires=Thu, 01 Jan 1970',
          caseSensitive: false,
        ).hasMatch(header);
    if (expired) {
      cookies.remove(name);
    } else {
      cookies[name] = value;
    }
  }
  return cookies;
}

class NextAuthCookieInterceptor extends QueuedInterceptor {
  final ISecureStorageService _storage;
  final OnUnauthenticatedCallback? _onUnauthenticated;

  NextAuthCookieInterceptor({
    required ISecureStorageService storageService,
    this._onUnauthenticated,
  }) : _storage = storageService;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (!kIsWeb) {
      final cookies = await _storage.getNextAuthCookies();
      if (cookies.isNotEmpty) {
        options.headers['Cookie'] = cookies.entries
            .map((entry) => '${entry.key}=${entry.value}')
            .join('; ');
      }
    }
    handler.next(options);
  }

  @override
  Future<void> onResponse(
    Response response,
    ResponseInterceptorHandler handler,
  ) async {
    await _captureCookies(response.headers['set-cookie']);
    handler.next(response);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    await _captureCookies(err.response?.headers['set-cookie']);
    final requiresAuth = err.requestOptions.extra[kRequiresAuthKey] ?? true;
    if (err.response?.statusCode == 401 && requiresAuth) {
      await _storage.clearSession();
      _onUnauthenticated?.call();
    }
    handler.next(err);
  }

  Future<void> _captureCookies(List<String>? setCookieHeaders) async {
    if (kIsWeb || setCookieHeaders == null || setCookieHeaders.isEmpty) return;
    final cookies = mergeNextAuthCookies(
      await _storage.getNextAuthCookies(),
      setCookieHeaders,
    );
    await _storage.saveNextAuthCookies(cookies);
  }
}
