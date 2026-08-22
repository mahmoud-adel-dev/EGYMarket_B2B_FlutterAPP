import '../constants/api_constants.dart';
import '../network/network_manager.dart';
import '../storage/secure_storage_service.dart';

/// Lightweight service locator. Chosen over get_it to avoid an extra dependency:
/// the app has exactly three process-wide singletons (storage, network, and the
/// auth session callbacks), which do not justify a package.
///
/// Screens must resolve collaborators through [ServiceLocator] instead of
/// constructing their own `NetworkManager`/`SecureStorageService` instances —
/// ad-hoc construction fragments cookie state and defeats request-level caching.
class ServiceLocator {
  ServiceLocator._();

  static ISecureStorageService? _storage;
  static INetworkManager? _network;

  /// Process-wide secure storage. Safe to call before [configure].
  static ISecureStorageService get storage =>
      _storage ??= SecureStorageService();

  /// Process-wide network manager bound to the environment base URL.
  ///
  /// [onUnauthenticated] is invoked by the cookie interceptor when the server
  /// definitively rejects a session (401), letting the app react globally.
  static INetworkManager network({void Function()? onUnauthenticated}) {
    _network ??= NetworkManager(
      baseUrl: ApiConstants.baseUrl,
      storageService: storage,
      onUnauthenticated: onUnauthenticated,
    );
    return _network!;
  }

  /// Test/preview seam: replace singletons explicitly.
  static void configureForTesting({
    ISecureStorageService? storage,
    INetworkManager? network,
  }) {
    _storage = storage;
    _network = network;
  }

  static void reset() {
    _storage = null;
    _network = null;
  }
}
