/// Push transport is intentionally disabled for the MongoDB-only MVP.
/// Notifications are persisted in MongoDB and fetched from /api/notifications.
class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  Future<void> initializeAndRegisterToken() async {}
  Future<void> unregisterToken() async {}
}
