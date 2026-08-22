import '../../data/models/notification_model.dart';

sealed class NotificationState {
  const NotificationState();
}

class NotificationInitial extends NotificationState {
  const NotificationInitial();
}

class NotificationLoading extends NotificationState {
  const NotificationLoading();
}

class NotificationLoaded extends NotificationState {
  final List<NotificationModel> notifications;
  final int unreadCount;
  final int page;
  final bool hasMore;
  final bool isUpdating;
  final bool isLoadingMore;
  final String? inlineError;

  const NotificationLoaded({
    required this.notifications,
    required this.unreadCount,
    this.page = 1,
    this.hasMore = false,
    this.isUpdating = false,
    this.isLoadingMore = false,
    this.inlineError,
  });

  NotificationLoaded copyWith({
    List<NotificationModel>? notifications,
    int? unreadCount,
    int? page,
    bool? hasMore,
    bool? isUpdating,
    bool? isLoadingMore,
    String? inlineError,
    bool clearError = false,
  }) {
    return NotificationLoaded(
      notifications: notifications ?? this.notifications,
      unreadCount: unreadCount ?? this.unreadCount,
      page: page ?? this.page,
      hasMore: hasMore ?? this.hasMore,
      isUpdating: isUpdating ?? this.isUpdating,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      inlineError: clearError ? null : (inlineError ?? this.inlineError),
    );
  }
}

class NotificationError extends NotificationState {
  final String message;
  const NotificationError(this.message);
}
