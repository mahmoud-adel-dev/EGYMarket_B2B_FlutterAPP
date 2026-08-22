import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

/// Centralized API Endpoints & Base Configuration for Clean Architecture
class ApiConstants {
  static const bool _allowLocalProductMode = bool.fromEnvironment(
    'ALLOW_LOCAL_PRODUCT_MODE',
    defaultValue: false,
  );

  static String get environment => dotenv.env['ENVIRONMENT'] ?? 'development';

  /// Dynamically resolves API Base URL based on active environment settings
  static String get baseUrl {
    if (environment == 'production' ||
        (kReleaseMode && !_allowLocalProductMode)) {
      final productionUrl = dotenv.env['API_BASE_URL_PROD'];
      if (productionUrl == null ||
          productionUrl.isEmpty ||
          productionUrl.contains('localhost')) {
        throw StateError(
          'API_BASE_URL_PROD must be configured for a release build',
        );
      }
      return productionUrl;
    }

    // Local Development Fallbacks (Using ADB Reverse Port Forwarding on localhost:3000)
    final localUrl = dotenv.env['API_BASE_URL_LOCAL'];
    if (localUrl != null && localUrl.isNotEmpty) {
      return localUrl;
    }

    return 'http://localhost:3000/api';
  }

  // --- Storage Keys ---
  static const String keyNextAuthCookies = 'nextauth_cookies';
  static const String keyUserRole = 'user_role';
  static const String keyUserId = 'user_id';

  // --- API Endpoints ---
  static const String csrf = '/auth/csrf';
  static const String session = '/auth/session';
  static const String credentialsCallback = '/auth/callback/credentials';
  static const String signOut = '/auth/signout';
  static const String register = '/auth/register';
  static const String me = '/auth/me';
  static const String products = '/products';
  static const String orders = '/orders';
  static const String shippers = '/shippers';
  static const String feed = '/feed';
  static const String ratings = '/ratings';
  static const String subscriptions = '/subscriptions';
  static const String shipperOrders = '/shippers/orders';
  static const String updateOrderStatus = '/orders';
  static const String currentSubscription = '/subscriptions/current';
  static const String paymentAccounts = '/organizations/me/payment-accounts';

  static String wholesalerPosts(String id) => '/wholesalers/$id/posts';
  static String postComments(String id) => '/posts/$id/comments';
  static String userPaymentSettings(String id) => '/users/$id/payment-settings';
  static String orderStatus(String id) => '/orders/$id/status';
}
