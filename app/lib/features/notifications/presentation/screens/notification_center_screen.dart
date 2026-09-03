import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:easy_localization/easy_localization.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../auth/data/models/auth_models.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
import '../../../auth/presentation/cubit/auth_state.dart';
import '../../../chat/presentation/screens/conversations_screen.dart';
import '../../../home/presentation/screens/social_feed_screen.dart';
import '../../../orders/presentation/screens/order_details_screen.dart';
import '../../../products/presentation/screens/product_catalog_screen.dart';
import '../../../profile/presentation/screens/organization_verification_screen.dart';
import '../../../wholesaler_profile/presentation/screens/subscription_plans_screen.dart';
import '../../../wholesaler_profile/presentation/screens/wholesaler_profile_screen.dart';
import '../../data/models/notification_model.dart';
import '../cubit/notification_cubit.dart';
import '../cubit/notification_state.dart';

class NotificationCenterScreen extends StatelessWidget {
  final AuthUserModel? user;
  final ValueChanged<int>? onUnreadChanged;
  final VoidCallback? onActivityChanged;

  const NotificationCenterScreen({
    super.key,
    this.user,
    this.onUnreadChanged,
    this.onActivityChanged,
  });

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthCubit>().state;
    final resolvedUser =
        user ?? (auth is AuthenticatedState ? auth.user : null);
    return BlocProvider(
      create: (_) =>
          NotificationCubit(networkManager: ServiceLocator.network())
            ..fetchNotifications(),
      child: _NotificationCenterView(
        user: resolvedUser,
        onUnreadChanged: onUnreadChanged,
        onActivityChanged: onActivityChanged,
      ),
    );
  }
}

class _NotificationCenterView extends StatefulWidget {
  final AuthUserModel? user;
  final ValueChanged<int>? onUnreadChanged;
  final VoidCallback? onActivityChanged;

  const _NotificationCenterView({
    required this.user,
    this.onUnreadChanged,
    this.onActivityChanged,
  });

  @override
  State<_NotificationCenterView> createState() =>
      _NotificationCenterViewState();
}

class _NotificationCenterViewState extends State<_NotificationCenterView> {
  final ScrollController _scrollController = ScrollController();
  String? _lastError;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  void _onScroll() {
    if (_scrollController.position.extentAfter < 360) {
      context.read<NotificationCubit>().loadMore();
    }
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
  }

  Future<void> _openNotification(NotificationModel notification) async {
    final cubit = context.read<NotificationCubit>();
    if (!notification.isRead) {
      // Read state is optimistic. Navigation must not wait on this request.
      cubit.markAsRead(notification.id);
    }
    final target = notification.target;
    final user = widget.user;
    if (!mounted) return;
    Widget? destination;
    switch (target.kind) {
      case NotificationTargetKind.order:
      case NotificationTargetKind.shipment:
        if (user != null) {
          destination = OrderDetailsScreen(
            orderId: target.id,
            currentUserRole: user.role,
            currentOrganizationId: user.organizationId ?? '',
            organizationMemberRole: user.organizationMemberRole,
            networkManager: ServiceLocator.network(),
            onOrderChanged: (_) => widget.onActivityChanged?.call(),
          );
        }
      case NotificationTargetKind.conversation:
        if (user != null) {
          destination = ConversationChatScreen(
            conversationId: target.id,
            title: notification.title,
            currentOrganizationId: user.organizationId ?? '',
          );
        }
      case NotificationTargetKind.post:
        destination = SocialFeedScreen(initialPostId: target.id);
      case NotificationTargetKind.product:
        destination = ProductCatalogScreen(initialProductId: target.id);
      case NotificationTargetKind.organization:
        destination = WholesalerProfileScreen(wholesalerId: target.id);
      case NotificationTargetKind.subscription:
        if (user != null) {
          destination = SubscriptionPlansScreen(
            userRole: user.role.displayName,
          );
        }
      case NotificationTargetKind.verification:
        destination = const OrganizationVerificationScreen();
      case NotificationTargetKind.unknown:
        destination = null;
    }

    if (destination == null) {
      ErrorHandler.showSecureSnackBar(
        context,
        target.isActionable
            ? tr('notification_no_permission')
            : tr('notification_no_link'),
        isError: true,
      );
      return;
    }
    await Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => destination!));
    if (mounted) {
      widget.onActivityChanged?.call();
      context.read<NotificationCubit>().fetchNotifications(
        preserveExisting: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(tr('notification_title')),
        centerTitle: false,
        actions: [
          BlocSelector<NotificationCubit, NotificationState, bool>(
            selector: (state) =>
                state is NotificationLoaded && state.unreadCount > 0,
            builder: (context, enabled) => IconButton(
              icon: const Icon(Icons.done_all_rounded),
              tooltip: tr('notification_mark_all_read'),
              onPressed: enabled
                  ? () => context.read<NotificationCubit>().markAllAsRead()
                  : null,
            ),
          ),
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: tr('notification_refresh'),
            onPressed: () => context
                .read<NotificationCubit>()
                .fetchNotifications(preserveExisting: true),
          ),
        ],
      ),
      body: BlocConsumer<NotificationCubit, NotificationState>(
        listenWhen: (previous, current) {
          if (current is NotificationLoaded) {
            final oldCount = previous is NotificationLoaded
                ? previous.unreadCount
                : null;
            return oldCount != current.unreadCount ||
                (current.inlineError != null &&
                    current.inlineError != _lastError);
          }
          return false;
        },
        listener: (context, state) {
          if (state is! NotificationLoaded) return;
          widget.onUnreadChanged?.call(state.unreadCount);
          if (state.inlineError != null && state.inlineError != _lastError) {
            _lastError = state.inlineError;
            ErrorHandler.showSecureSnackBar(
              context,
              state.inlineError!,
              isError: true,
            );
          }
        },
        builder: (context, state) {
          if (state is NotificationLoading || state is NotificationInitial) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state is NotificationError) {
            return _NotificationErrorView(
              message: state.message,
              onRetry: () =>
                  context.read<NotificationCubit>().fetchNotifications(),
            );
          }
          final loaded = state as NotificationLoaded;
          if (loaded.notifications.isEmpty) {
            return RefreshIndicator(
              onRefresh: () => context
                  .read<NotificationCubit>()
                  .fetchNotifications(preserveExisting: true),
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  const SizedBox(height: 180),
                  const Icon(
                    Icons.notifications_none_rounded,
                    size: 64,
                    color: Colors.black26,
                  ),
                  const SizedBox(height: 12),
                  Center(child: Text(tr('notification_empty'))),
                ],
              ),
            );
          }
          return Stack(
            children: [
              RefreshIndicator(
                onRefresh: () => context
                    .read<NotificationCubit>()
                    .fetchNotifications(preserveExisting: true),
                child: ListView.separated(
                  controller: _scrollController,
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 32),
                  itemCount:
                      loaded.notifications.length +
                      (loaded.isLoadingMore ? 1 : 0),
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    if (index == loaded.notifications.length) {
                      return const Padding(
                        padding: EdgeInsets.all(16),
                        child: Center(child: CircularProgressIndicator()),
                      );
                    }
                    final notification = loaded.notifications[index];
                    return _NotificationTile(
                      notification: notification,
                      onTap: () => _openNotification(notification),
                    );
                  },
                ),
              ),
              if (loaded.isUpdating)
                const PositionedDirectional(
                  start: 0,
                  end: 0,
                  top: 0,
                  child: LinearProgressIndicator(minHeight: 2),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  final NotificationModel notification;
  final VoidCallback onTap;

  const _NotificationTile({required this.notification, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final visual = _notificationVisual(notification.type);
    final targetHint = notification.target.isActionable
        ? tr('notification_tap_hint')
        : '';
    final readLabel = notification.isRead
        ? tr('notification_read')
        : tr('notification_unread');
    return Semantics(
      button: true,
      readOnly: notification.isRead,
      label:
          '$readLabel، ${notification.title}، ${notification.body}$targetHint',
      child: Material(
        color: notification.isRead
            ? Theme.of(context).colorScheme.surface
            : Theme.of(
                context,
              ).colorScheme.primaryContainer.withValues(alpha: 0.36),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(
            color: notification.isRead
                ? Theme.of(context).dividerColor.withValues(alpha: 0.5)
                : Theme.of(context).colorScheme.primary.withValues(alpha: 0.2),
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  backgroundColor: visual.color.withValues(alpha: 0.12),
                  foregroundColor: visual.color,
                  child: Icon(visual.icon, semanticLabel: visual.label),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              notification.title,
                              style: TextStyle(
                                fontWeight: notification.isRead
                                    ? FontWeight.w600
                                    : FontWeight.w800,
                              ),
                            ),
                          ),
                          if (!notification.isRead)
                            Container(
                              width: 9,
                              height: 9,
                              decoration: BoxDecoration(
                                color: Theme.of(context).colorScheme.primary,
                                shape: BoxShape.circle,
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 5),
                      Text(
                        notification.body,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Icon(
                            Icons.schedule_rounded,
                            size: 14,
                            color: Theme.of(context).colorScheme.outline,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            _relativeTime(notification.createdAt),
                            style: Theme.of(context).textTheme.labelSmall,
                          ),
                          const Spacer(),
                          if (notification.target.isActionable)
                            const Icon(Icons.chevron_right_rounded, size: 20),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NotificationVisual {
  final IconData icon;
  final Color color;
  final String label;
  const _NotificationVisual(this.icon, this.color, this.label);
}

_NotificationVisual _notificationVisual(String type) {
  if (type.startsWith('payment_')) {
    return _NotificationVisual(
      Icons.account_balance_wallet_outlined,
      const Color(0xFF7C3AED),
      tr('notification_type_payment'),
    );
  }
  if (type.contains('rejected') || type.contains('canceled')) {
    return _NotificationVisual(
      Icons.cancel_outlined,
      const Color(0xFFB91C1C),
      tr('notification_type_cancel'),
    );
  }
  return switch (type) {
    'order_created' => _NotificationVisual(
      Icons.shopping_bag_outlined,
      const Color(0xFFEA580C),
      tr('notification_type_order_new'),
    ),
    'order_accepted' || 'order_confirmed' => _NotificationVisual(
      Icons.task_alt_rounded,
      const Color(0xFF15803D),
      tr('notification_type_order_confirmed'),
    ),
    'order_picked_up' ||
    'order_delivered' ||
    'tracking_updated' => _NotificationVisual(
      Icons.local_shipping_outlined,
      const Color(0xFF0369A1),
      tr('notification_type_shipment'),
    ),
    'post_liked' => _NotificationVisual(
      Icons.favorite_outline_rounded,
      const Color(0xFFDB2777),
      tr('notification_type_like'),
    ),
    'comment_received' => _NotificationVisual(
      Icons.mode_comment_outlined,
      const Color(0xFF2563EB),
      tr('notification_type_comment'),
    ),
    'rating_received' => _NotificationVisual(
      Icons.star_outline_rounded,
      const Color(0xFFD97706),
      tr('notification_type_rating'),
    ),
    'follow_received' => _NotificationVisual(
      Icons.person_add_alt_1_rounded,
      const Color(0xFF0F766E),
      tr('notification_type_follow'),
    ),
    'inquiry_received' || 'message_received' => _NotificationVisual(
      Icons.mark_chat_unread_outlined,
      const Color(0xFF059669),
      tr('notification_type_message'),
    ),
    'verification_updated' => _NotificationVisual(
      Icons.verified_outlined,
      const Color(0xFF0284C7),
      tr('notification_type_verification'),
    ),
    'subscription_updated' => _NotificationVisual(
      Icons.workspace_premium_outlined,
      const Color(0xFF7C3AED),
      tr('notification_type_subscription'),
    ),
    _ => _NotificationVisual(
      Icons.notifications_outlined,
      const Color(0xFF475569),
      tr('notification_type_default'),
    ),
  };
}

String _relativeTime(DateTime? value) {
  if (value == null) return '';
  final difference = DateTime.now().difference(value.toLocal());
  if (difference.inMinutes < 1) return tr('time_just_now');
  if (difference.inHours < 1) {
    return tr(
      'notification_time_minutes',
      namedArgs: {'count': '${difference.inMinutes}'},
    );
  }
  if (difference.inDays < 1) {
    return tr(
      'notification_time_hours',
      namedArgs: {'count': '${difference.inHours}'},
    );
  }
  if (difference.inDays < 7) {
    return tr(
      'notification_time_days',
      namedArgs: {'count': '${difference.inDays}'},
    );
  }
  return '${value.toLocal().day}/${value.toLocal().month}/${value.toLocal().year}';
}

class _NotificationErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _NotificationErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline_rounded, size: 52),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded),
              label: Text(tr('retry')),
            ),
          ],
        ),
      ),
    );
  }
}
