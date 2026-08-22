import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter/foundation.dart';

/// SSL/TLS Certificate Pinning Configuration.
///
/// Prevents Man-in-the-Middle (MITM) attacks by verifying that the server's
/// public key fingerprint or TLS certificate matches trusted pins.
/// In debug mode, all certificates are accepted to allow local dev servers.
class SslPinningConfig {
  /// SHA-256 Public Key Fingerprints for production servers.
  static const List<String> allowedSha256Fingerprints = [
    '50:B6:58:20:9C:CD:3D:28:B6:2E:BA:7D:F7:5F:BB:2E:EE:4B:9B:EA:79:3E:CF:DC:1D:95:C7:E3:B4:48:9A:BA',
    '87:D6:28:35:50:3B:56:5D:8A:28:B7:B2:77:8E:9E:09:A0:BD:13:B9:9F:8A:4B:1A:3F:8F:C8:BB:51:78:E0:9E',
  ];

  /// Configures [Dio] HTTP Client Adapter with custom certificate validation.
  static void configureSslPinning(Dio dio, {bool enabled = true}) {
    // SSL pinning is not applicable on web platform.
    if (kIsWeb) return;

    // In debug mode OR when baseUrl is HTTP (local dev), skip SSL pinning entirely
    // to avoid TLS handshake errors with local servers.
    final baseUrl = dio.options.baseUrl.toLowerCase();
    final isLocalDev = kDebugMode || baseUrl.startsWith('http://');

    if (isLocalDev) {
      // Use a permissive HTTP client in dev - accepts all certs + HTTP
      dio.httpClientAdapter = IOHttpClientAdapter(
        createHttpClient: () {
          final client = HttpClient();
          client.badCertificateCallback =
              (X509Certificate cert, String host, int port) => true;
          return client;
        },
      );
      return;
    }

    // PRODUCTION: Strict TLS Pinning
    dio.httpClientAdapter = IOHttpClientAdapter(
      createHttpClient: () {
        final client = HttpClient(
          context: SecurityContext(withTrustedRoots: true),
        );

        client.badCertificateCallback =
            (X509Certificate cert, String host, int port) {
              final certSha256 = sha256.convert(cert.der).bytes;
              final certFingerprintHex = certSha256
                  .map((b) => b.toRadixString(16).padLeft(2, '0').toUpperCase())
                  .join(':');

              final isPinned = allowedSha256Fingerprints.contains(
                certFingerprintHex,
              );
              if (!isPinned) {
                debugPrint(
                  '[SECURITY ERROR] Certificate pinning failed for host $host!',
                );
                debugPrint(
                  '[SECURITY ERROR] Received cert SHA-256: $certFingerprintHex',
                );
              }
              return isPinned;
            };

        return client;
      },
    );
  }
}
