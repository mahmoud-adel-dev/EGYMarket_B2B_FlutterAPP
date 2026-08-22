import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../constants/api_constants.dart';

abstract class ISecureStorageService {
  Future<Map<String, String>> getNextAuthCookies();
  Future<void> saveNextAuthCookies(Map<String, String> cookies);
  Future<bool> hasNextAuthSession();
  Future<void> saveUserRole(String role);
  Future<String?> getUserRole();
  Future<void> saveUserId(String userId);
  Future<String?> getUserId();
  Future<void> clearSession();
  Future<void> write({required String key, required String value});
  Future<String?> read({required String key});
  Future<void> delete({required String key});
  Future<void> clearAll();
}

class SecureStorageService implements ISecureStorageService {
  final FlutterSecureStorage _storage;

  SecureStorageService({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            aOptions: AndroidOptions(),
            iOptions: IOSOptions(
              accessibility: KeychainAccessibility.first_unlock_this_device,
            ),
          );

  @override
  Future<Map<String, String>> getNextAuthCookies() async {
    final encoded = await _storage.read(key: ApiConstants.keyNextAuthCookies);
    if (encoded == null || encoded.isEmpty) return {};
    try {
      final decoded = jsonDecode(encoded) as Map<String, dynamic>;
      return decoded.map((key, value) => MapEntry(key, value.toString()));
    } catch (_) {
      await _storage.delete(key: ApiConstants.keyNextAuthCookies);
      return {};
    }
  }

  @override
  Future<void> saveNextAuthCookies(Map<String, String> cookies) => _storage
      .write(key: ApiConstants.keyNextAuthCookies, value: jsonEncode(cookies));

  @override
  Future<bool> hasNextAuthSession() async {
    final cookies = await getNextAuthCookies();
    return cookies.keys.any((key) => key.endsWith('session-token'));
  }

  @override
  Future<void> saveUserRole(String role) =>
      _storage.write(key: ApiConstants.keyUserRole, value: role);

  @override
  Future<String?> getUserRole() => _storage.read(key: ApiConstants.keyUserRole);

  @override
  Future<void> saveUserId(String userId) =>
      _storage.write(key: ApiConstants.keyUserId, value: userId);

  @override
  Future<String?> getUserId() => _storage.read(key: ApiConstants.keyUserId);

  @override
  Future<void> clearSession() async {
    await Future.wait([
      _storage.delete(key: ApiConstants.keyNextAuthCookies),
      _storage.delete(key: ApiConstants.keyUserRole),
      _storage.delete(key: ApiConstants.keyUserId),
    ]);
  }

  @override
  Future<void> write({required String key, required String value}) =>
      _storage.write(key: key, value: value);

  @override
  Future<String?> read({required String key}) => _storage.read(key: key);

  @override
  Future<void> delete({required String key}) => _storage.delete(key: key);

  @override
  Future<void> clearAll() => _storage.deleteAll();
}
