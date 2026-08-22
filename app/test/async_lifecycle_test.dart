import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seals_app/core/di/service_locator.dart';
import 'package:seals_app/core/errors/network_exception.dart';
import 'package:seals_app/core/network/network_manager.dart';
import 'package:seals_app/core/storage/secure_storage_service.dart';
import 'package:seals_app/features/auth/data/models/auth_models.dart';
import 'package:seals_app/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:seals_app/features/auth/presentation/cubit/auth_state.dart';
import 'package:seals_app/features/home/presentation/screens/social_feed_screen.dart';
import 'package:seals_app/features/orders/presentation/cubit/order_management_cubit.dart';
import 'package:seals_app/features/orders/presentation/cubit/order_management_state.dart';
import 'package:seals_app/features/wholesaler_profile/presentation/cubit/wholesaler_profile_cubit.dart';

typedef _RequestHandler =
    Future<Map<String, dynamic>> Function(String path, dynamic data);

class _FakeNetworkManager implements INetworkManager {
  _RequestHandler? onGet;
  _RequestHandler? onPost;
  _RequestHandler? onPatch;
  final List<String> getPaths = [];
  final List<String> postPaths = [];
  final List<String> patchPaths = [];

  @override
  Future<T> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    T Function(dynamic data)? decoder,
    bool requiresAuth = true,
  }) async {
    getPaths.add(path);
    final response = await onGet!(path, null);
    return response as T;
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
    patchPaths.add(path);
    final response = await onPatch!(path, data);
    return response as T;
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
    postPaths.add(path);
    final response = await onPost!(path, data);
    return response as T;
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
  }) => throw UnsupportedError('PUT is not used by these tests.');

  @override
  Future<T> delete<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    T Function(dynamic data)? decoder,
    bool requiresAuth = true,
  }) => throw UnsupportedError('DELETE is not used by these tests.');
}

class _UnusedStorage implements ISecureStorageService {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _ReadyAuthCubit extends AuthCubit {
  _ReadyAuthCubit({required super.networkManager})
    : super(storageService: _UnusedStorage()) {
    emit(
      AuthenticatedState(
        const AuthUserModel(
          id: 'buyer-1',
          name: 'Lifecycle Buyer',
          email: 'buyer@example.com',
          phone: '01000000000',
          role: UserRole.retailer,
        ),
      ),
    );
  }
}

void main() {
  group('OrderManagementCubit async lifecycle', () {
    test('ignores a successful GET that completes after close', () async {
      final pendingGet = Completer<Map<String, dynamic>>();
      final network = _FakeNetworkManager()
        ..onGet = (_, _) => pendingGet.future;
      final cubit = OrderManagementCubit(networkManager: network);

      final operation = cubit.fetchOrders();
      final completion = expectLater(operation, completes);
      await cubit.close();
      pendingGet.complete({'orders': <dynamic>[]});

      await completion;
    });

    test('ignores a failed GET that completes after close', () async {
      final pendingGet = Completer<Map<String, dynamic>>();
      final network = _FakeNetworkManager()
        ..onGet = (_, _) => pendingGet.future;
      final cubit = OrderManagementCubit(networkManager: network);

      final operation = cubit.fetchOrders();
      final completion = expectLater(operation, completes);
      await cubit.close();
      pendingGet.completeError(
        NetworkException(message: 'delayed network failure'),
      );

      await completion;
    });

    test('does not refresh orders after closing during a PATCH', () async {
      final pendingPatch = Completer<Map<String, dynamic>>();
      final network = _FakeNetworkManager();
      network.onGet = (_, _) async => {'orders': <dynamic>[]};
      network.onPatch = (_, _) => pendingPatch.future;
      final cubit = OrderManagementCubit(networkManager: network);
      await cubit.fetchOrders();
      expect(cubit.state, isA<OrderManagementLoaded>());

      final operation = cubit.performAction(
        orderId: 'order-1',
        action: 'accept',
      );
      final completion = expectLater(operation, completes);
      await cubit.close();
      pendingPatch.complete(<String, dynamic>{});

      await completion;
      expect(network.getPaths, ['/orders']);
    });
  });

  group('WholesalerProfileCubit async lifecycle', () {
    test(
      'does not start child requests after closing during profile GET',
      () async {
        final pendingProfile = Completer<Map<String, dynamic>>();
        final network = _FakeNetworkManager()
          ..onGet = (_, _) => pendingProfile.future;
        final cubit = WholesalerProfileCubit(networkManager: network);

        final operation = cubit.fetchWholesalerProfile('seller-1');
        final completion = expectLater(operation, completes);
        await cubit.close();
        pendingProfile.complete(<String, dynamic>{});

        await completion;
        expect(network.getPaths, ['/wholesalers/seller-1']);
      },
    );

    test('ignores child responses that complete after close', () async {
      final children = <String, Completer<Map<String, dynamic>>>{};
      final network = _FakeNetworkManager()
        ..onGet = (path, _) {
          if (path == '/wholesalers/seller-1') {
            return Future.value(<String, dynamic>{});
          }
          final pending = Completer<Map<String, dynamic>>();
          children[path] = pending;
          return pending.future;
        };
      final cubit = WholesalerProfileCubit(networkManager: network);

      final operation = cubit.fetchWholesalerProfile('seller-1');
      final completion = expectLater(operation, completes);
      await Future<void>.delayed(Duration.zero);
      expect(children.length, 3);
      await cubit.close();
      children['/wholesalers/seller-1/posts']!.complete({'posts': <dynamic>[]});
      children['/wholesalers/seller-1/products']!.complete({
        'products': <dynamic>[],
      });
      children['/wholesalers/seller-1/reviews']!.complete({
        'reviews': <dynamic>[],
      });

      await completion;
    });

    test('ignores a profile failure that arrives after close', () async {
      final pendingProfile = Completer<Map<String, dynamic>>();
      final network = _FakeNetworkManager()
        ..onGet = (_, _) => pendingProfile.future;
      final cubit = WholesalerProfileCubit(networkManager: network);

      final operation = cubit.fetchWholesalerProfile('seller-1');
      final completion = expectLater(operation, completes);
      await cubit.close();
      pendingProfile.completeError(
        NetworkException(message: 'delayed profile failure'),
      );

      await completion;
    });
  });

  testWidgets(
    'post details keeps like action alive after the feed parent is disposed',
    (tester) async {
      final network = _FakeNetworkManager();
      network.onGet = (path, _) async {
        expect(path, startsWith('/posts?'));
        return {
          'posts': [
            {
              '_id': 'post-1',
              'wholesalerId': 'seller-1',
              'wholesalerName': 'Lifecycle Seller',
              'wholesalerGovernorate': 'Cairo',
              'caption': 'Lifecycle test post',
              'category': 'Electronics',
              'mediaUrls': <String>[],
              'videoUrls': <String>[],
              'comments': <dynamic>[],
              'likesCount': 0,
              'commentsCount': 0,
              'likedByCurrentUser': false,
              'createdAt': '2026-08-22T08:00:00.000Z',
            },
          ],
          'categories': ['All', 'Electronics'],
          'pagination': {'hasMore': false},
        };
      };
      network.onPost = (path, _) async {
        expect(path, '/posts/post-1/likes');
        return {'liked': true, 'likesCount': 1};
      };
      ServiceLocator.configureForTesting(network: network);
      final authCubit = _ReadyAuthCubit(networkManager: network);
      final showFeed = ValueNotifier(true);
      addTearDown(() async {
        ServiceLocator.reset();
        showFeed.dispose();
        await authCubit.close();
      });

      await tester.pumpWidget(
        BlocProvider<AuthCubit>.value(
          value: authCubit,
          child: MaterialApp(
            home: ValueListenableBuilder<bool>(
              valueListenable: showFeed,
              builder: (_, visible, _) =>
                  visible ? const SocialFeedScreen() : const SizedBox.shrink(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Lifecycle test post'));
      await tester.pumpAndSettle();

      showFeed.value = false;
      await tester.pump();
      await tester.tap(find.byIcon(Icons.thumb_up_alt_outlined));
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(network.postPaths, ['/posts/post-1/likes']);
      expect(find.textContaining('1'), findsWidgets);
    },
  );
}
