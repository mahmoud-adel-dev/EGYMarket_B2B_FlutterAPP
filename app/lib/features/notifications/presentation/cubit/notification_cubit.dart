import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/errors/error_handler.dart';
import '../../../../core/network/network_manager.dart';
import '../../data/models/notification_model.dart';
import 'notification_state.dart';

class NotificationCubit extends Cubit<NotificationState> {
  final INetworkManager _networkManager;
  int _fetchGeneration = 0;
  final Set<String> _pendingReadIds = <String>{};

  NotificationCubit({required this._networkManager})
    : super(const NotificationInitial());

  void _safeEmit(NotificationState next) {
    if (!isClosed) emit(next);
  }

  Future<void> fetchNotifications({bool preserveExisting = false}) async {
    final generation = ++_fetchGeneration;
    final previous = state is NotificationLoaded
        ? state as NotificationLoaded
        : null;
    if (previous != null && preserveExisting) {
      _safeEmit(previous.copyWith(isUpdating: true, clearError: true));
    } else {
      _safeEmit(const NotificationLoading());
    }
    try {
      final response = await _networkManager.get<Map<String, dynamic>>(
        '/notifications',
        queryParameters: const {'page': 1, 'limit': 20},
      );
      if (isClosed || generation != _fetchGeneration) return;
      final rawList = response['notifications'] as List<dynamic>? ?? const [];
      final pagination = response['pagination'] is Map
          ? Map<String, dynamic>.from(response['pagination'] as Map)
          : const <String, dynamic>{};
      _safeEmit(
        NotificationLoaded(
          notifications: rawList
              .map(
                (row) => NotificationModel.fromJson(
                  Map<String, dynamic>.from(row as Map),
                ),
              )
              .toList(),
          unreadCount: (response['unreadCount'] as num?)?.toInt() ?? 0,
          page: (pagination['page'] as num?)?.toInt() ?? 1,
          hasMore:
              ((pagination['page'] as num?)?.toInt() ?? 1) <
              ((pagination['pages'] as num?)?.toInt() ?? 1),
        ),
      );
    } catch (error) {
      if (isClosed || generation != _fetchGeneration) return;
      final message = ErrorHandler.getUserFriendlyMessage(error);
      final current = state;
      if (current is NotificationLoaded) {
        _safeEmit(current.copyWith(isUpdating: false, inlineError: message));
      } else {
        _safeEmit(NotificationError(message));
      }
    }
  }

  Future<void> loadMore() async {
    final current = state;
    if (current is! NotificationLoaded ||
        current.isLoadingMore ||
        !current.hasMore) {
      return;
    }
    _safeEmit(current.copyWith(isLoadingMore: true, clearError: true));
    try {
      final nextPage = current.page + 1;
      final response = await _networkManager.get<Map<String, dynamic>>(
        '/notifications',
        queryParameters: {'page': nextPage, 'limit': 20},
      );
      if (isClosed || state is! NotificationLoaded) return;
      final latest = state as NotificationLoaded;
      final rows = response['notifications'] as List<dynamic>? ?? const [];
      final incoming = rows
          .map(
            (row) => NotificationModel.fromJson(
              Map<String, dynamic>.from(row as Map),
            ),
          )
          .toList();
      final byId = <String, NotificationModel>{
        for (final notification in latest.notifications)
          notification.id: notification,
        for (final notification in incoming) notification.id: notification,
      };
      final pagination = response['pagination'] is Map
          ? Map<String, dynamic>.from(response['pagination'] as Map)
          : const <String, dynamic>{};
      final page = (pagination['page'] as num?)?.toInt() ?? nextPage;
      final pages = (pagination['pages'] as num?)?.toInt() ?? page;
      _safeEmit(
        latest.copyWith(
          notifications: byId.values.toList(),
          unreadCount:
              (response['unreadCount'] as num?)?.toInt() ?? latest.unreadCount,
          page: page,
          hasMore: page < pages,
          isLoadingMore: false,
        ),
      );
    } catch (error) {
      if (isClosed || state is! NotificationLoaded) return;
      final latest = state as NotificationLoaded;
      _safeEmit(
        latest.copyWith(
          isLoadingMore: false,
          inlineError: ErrorHandler.getUserFriendlyMessage(error),
        ),
      );
    }
  }

  Future<bool> markAsRead(String notificationId) async {
    final current = state;
    if (current is! NotificationLoaded) return false;
    final existing = current.notifications
        .where((notification) => notification.id == notificationId)
        .firstOrNull;
    if (existing == null ||
        existing.isRead ||
        _pendingReadIds.contains(notificationId)) {
      return existing?.isRead == true;
    }

    _pendingReadIds.add(notificationId);
    _safeEmit(
      current.copyWith(
        notifications: current.notifications
            .map(
              (notification) => notification.id == notificationId
                  ? notification.copyWith(
                      isRead: true,
                      readAt: DateTime.now().toUtc(),
                    )
                  : notification,
            )
            .toList(),
        unreadCount: (current.unreadCount - 1).clamp(0, 1 << 31),
        clearError: true,
      ),
    );
    try {
      final response = await _networkManager.patch<Map<String, dynamic>>(
        '/notifications/$notificationId/read',
      );
      if (isClosed) return true;
      final latest = state;
      if (latest is NotificationLoaded && response['unreadCount'] is num) {
        _safeEmit(
          latest.copyWith(
            unreadCount: (response['unreadCount'] as num).toInt(),
          ),
        );
      }
      return true;
    } catch (error) {
      if (!isClosed && state is NotificationLoaded) {
        final latest = state as NotificationLoaded;
        _safeEmit(
          latest.copyWith(
            notifications: latest.notifications
                .map(
                  (notification) => notification.id == notificationId
                      ? notification.copyWith(isRead: false)
                      : notification,
                )
                .toList(),
            unreadCount: latest.unreadCount + 1,
            inlineError: ErrorHandler.getUserFriendlyMessage(error),
          ),
        );
      }
      return false;
    } finally {
      _pendingReadIds.remove(notificationId);
    }
  }

  Future<bool> markAllAsRead() async {
    final current = state;
    if (current is! NotificationLoaded || current.unreadCount == 0) return true;
    _safeEmit(
      current.copyWith(
        notifications: current.notifications
            .map(
              (notification) => notification.copyWith(
                isRead: true,
                readAt: notification.readAt ?? DateTime.now().toUtc(),
              ),
            )
            .toList(),
        unreadCount: 0,
        isUpdating: true,
        clearError: true,
      ),
    );
    try {
      final response = await _networkManager.patch<Map<String, dynamic>>(
        '/notifications/read-all',
      );
      if (isClosed || state is! NotificationLoaded) return true;
      final latest = state as NotificationLoaded;
      _safeEmit(
        latest.copyWith(
          unreadCount: (response['unreadCount'] as num?)?.toInt() ?? 0,
          isUpdating: false,
        ),
      );
      return true;
    } catch (error) {
      if (!isClosed && state is NotificationLoaded) {
        final latest = state as NotificationLoaded;
        _safeEmit(
          latest.copyWith(
            isUpdating: false,
            inlineError: ErrorHandler.getUserFriendlyMessage(error),
          ),
        );
        await fetchNotifications(preserveExisting: true);
      }
      return false;
    }
  }
}
