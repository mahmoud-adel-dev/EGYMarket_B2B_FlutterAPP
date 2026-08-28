import 'dart:async';
import 'dart:math' as math;

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../auth/data/models/auth_models.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
import '../../../auth/presentation/screens/login_screen.dart';
import '../../../cart/presentation/screens/local_cart_screen.dart';
import '../../../chat/presentation/screens/conversations_screen.dart';
import '../../../notifications/presentation/screens/notification_center_screen.dart';
import '../../../orders/presentation/screens/orders_list_screen.dart';
import '../../../orders/presentation/screens/shipper_dashboard_screen.dart';
import '../../../products/presentation/screens/product_catalog_screen.dart';
import '../../../products/presentation/screens/seller_products_screen.dart';
import '../../../profile/presentation/screens/account_hub_screen.dart';
import '../../../profile/presentation/screens/role_based_profile_screen.dart';
import '../../../wholesaler_dashboard/presentation/screens/wholesaler_dashboard_screen.dart';
import '../../../wholesaler_portal/presentation/screens/create_post_screen.dart';
import '../../../wholesaler_profile/presentation/screens/merchant_payment_settings_screen.dart';
import '../../../wholesaler_profile/presentation/screens/subscription_plans_screen.dart';
import '../../../wholesaler_profile/presentation/screens/wholesaler_profile_screen.dart';
import '../../../wholesalers/presentation/screens/wholesalers_list_screen.dart';
import 'social_feed_screen.dart';

class MainTabNavigationScreen extends StatefulWidget {
  final AuthUserModel? user;

  const MainTabNavigationScreen({super.key, this.user});

  @override
  State<MainTabNavigationScreen> createState() =>
      _MainTabNavigationScreenState();
}

class _MainTabNavigationScreenState extends State<MainTabNavigationScreen> {
  int _currentIndex = 0;
  int _unreadNotifications = 0;
  int _orderAttentionCount = 0;
  Timer? _activityTimer;
  int _activityGeneration = 0;

  @override
  void initState() {
    super.initState();
    _startActivityPolling();
  }

  void _startActivityPolling() {
    _activityTimer?.cancel();
    final generation = ++_activityGeneration;
    if (widget.user == null) {
      _unreadNotifications = 0;
      _orderAttentionCount = 0;
      return;
    }
    _loadActivitySummary(generation: generation);
    _activityTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _loadActivitySummary(generation: generation),
    );
  }

  Future<void> _loadActivitySummary({int? generation}) async {
    if (widget.user == null) return;
    final expectedGeneration = generation ?? _activityGeneration;
    try {
      final network = ServiceLocator.network();
      final responses = await Future.wait<Map<String, dynamic>>([
        network.get<Map<String, dynamic>>(
          '/notifications',
          queryParameters: const {'limit': 1},
        ),
        network.get<Map<String, dynamic>>('/orders/attention-summary'),
      ]);
      if (!mounted || expectedGeneration != _activityGeneration) return;
      final attention = responses[1]['attention'] is Map
          ? Map<String, dynamic>.from(responses[1]['attention'] as Map)
          : const <String, dynamic>{};
      setState(() {
        _unreadNotifications =
            (responses[0]['unreadCount'] as num?)?.toInt() ??
            _unreadNotifications;
        _orderAttentionCount =
            (attention['order_count'] as num?)?.toInt() ?? _orderAttentionCount;
      });
    } catch (error, stackTrace) {
      // Keep the last truthful values during transient network failures.
      debugPrint('Activity summary refresh failed: $error\n$stackTrace');
    }
  }

  @override
  void didUpdateWidget(covariant MainTabNavigationScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.user?.id != widget.user?.id ||
        oldWidget.user?.role != widget.user?.role) {
      _currentIndex = 0;
      _startActivityPolling();
    }
  }

  @override
  void dispose() {
    _activityTimer?.cancel();
    super.dispose();
  }

  _NavigationData _navigationData(BuildContext context) {
    final user = widget.user;
    final role = user?.role;

    if (user == null) {
      return _NavigationData(
        screens: [
          const SocialFeedScreen(),
          const ProductCatalogScreen(),
          const WholesalersListScreen(),
          const LocalCartScreen(),
        ],
        items: [
          _NavItem(
            Icons.dynamic_feed_rounded,
            Icons.dynamic_feed_outlined,
            tr('feed'),
          ),
          _NavItem(
            Icons.grid_view_rounded,
            Icons.grid_view_outlined,
            tr('catalog'),
          ),
          _NavItem(
            Icons.storefront_rounded,
            Icons.storefront_outlined,
            tr('wholesalers'),
          ),
          _NavItem(
            Icons.shopping_bag_rounded,
            Icons.shopping_bag_outlined,
            tr('cart'),
          ),
        ],
      );
    }

    if (role == UserRole.wholesaler) {
      return _NavigationData(
        screens: [
          const WholesalerDashboardScreen(),
          const SellerProductsScreen(),
          OrdersListScreen(
            userRole: UserRole.wholesaler,
            onActivityChanged: _loadActivitySummary,
          ),
          ConversationsScreen(currentOrganizationId: user.organizationId ?? ''),
          WholesalerProfileScreen(wholesalerId: user.organizationId ?? user.id),
          const CreatePostScreen(),
        ],
        items: [
          _NavItem(
            Icons.dashboard_rounded,
            Icons.dashboard_outlined,
            tr('dashboard'),
          ),
          _NavItem(
            Icons.inventory_2_rounded,
            Icons.inventory_2_outlined,
            tr('products_tab'),
          ),
          _NavItem(
            Icons.receipt_long_rounded,
            Icons.receipt_long_outlined,
            tr('orders'),
            destination: _NavigationDestination.orders,
            badgeCount: _orderAttentionCount,
          ),
          _NavItem(
            Icons.forum_rounded,
            Icons.forum_outlined,
            tr('chat'),
            destination: _NavigationDestination.chat,
          ),
          _NavItem(
            Icons.storefront_rounded,
            Icons.storefront_outlined,
            tr('my_storefront'),
          ),
          _NavItem(
            Icons.add_box_rounded,
            Icons.add_box_outlined,
            tr('add_post'),
          ),
        ],
      );
    }

    if (role == UserRole.shipper) {
      return _NavigationData(
        screens: [
          ShipperDashboardScreen(onActivityChanged: _loadActivitySummary),
          ConversationsScreen(currentOrganizationId: user.organizationId ?? ''),
          const MerchantPaymentSettingsScreen(),
          const SubscriptionPlansScreen(userRole: 'Shipper'),
          const RoleBasedProfileScreen(),
        ],
        items: [
          _NavItem(
            Icons.inventory_2_rounded,
            Icons.inventory_2_outlined,
            tr('orders'),
            destination: _NavigationDestination.orders,
            badgeCount: _orderAttentionCount,
          ),
          _NavItem(
            Icons.forum_rounded,
            Icons.forum_outlined,
            tr('chat'),
            destination: _NavigationDestination.chat,
          ),
          _NavItem(
            Icons.account_balance_wallet_rounded,
            Icons.account_balance_wallet_outlined,
            tr('payment_settings'),
          ),
          _NavItem(
            Icons.workspace_premium_rounded,
            Icons.workspace_premium_outlined,
            tr('subscription'),
          ),
          _NavItem(
            Icons.account_circle_rounded,
            Icons.account_circle_outlined,
            tr('profile'),
          ),
        ],
      );
    }

    return _NavigationData(
      screens: [
        const SocialFeedScreen(),
        const ProductCatalogScreen(),
        const WholesalersListScreen(),
        const LocalCartScreen(),
        OrdersListScreen(
          userRole: UserRole.retailer,
          onActivityChanged: _loadActivitySummary,
        ),
        ConversationsScreen(currentOrganizationId: user.organizationId ?? ''),
      ],
      items: [
        _NavItem(
          Icons.dynamic_feed_rounded,
          Icons.dynamic_feed_outlined,
          tr('feed'),
        ),
        _NavItem(
          Icons.grid_view_rounded,
          Icons.grid_view_outlined,
          tr('catalog'),
        ),
        _NavItem(
          Icons.storefront_rounded,
          Icons.storefront_outlined,
          tr('wholesalers'),
        ),
        _NavItem(
          Icons.shopping_bag_rounded,
          Icons.shopping_bag_outlined,
          tr('cart'),
        ),
        _NavItem(
          Icons.inventory_2_rounded,
          Icons.inventory_2_outlined,
          tr('orders'),
          destination: _NavigationDestination.orders,
          badgeCount: _orderAttentionCount,
        ),
        _NavItem(
          Icons.forum_rounded,
          Icons.forum_outlined,
          tr('chat'),
          destination: _NavigationDestination.chat,
        ),
      ],
    );
  }

  void _toggleLocale() {
    context.setLocale(
      context.locale.languageCode == 'ar'
          ? const Locale('en')
          : const Locale('ar'),
    );
  }

  void _openLogin() {
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const LoginScreen()));
  }

  void _openNotifications() {
    final user = widget.user;
    if (user == null) return;
    Navigator.of(context)
        .push(
          MaterialPageRoute(
            builder: (_) => NotificationCenterScreen(
              user: user,
              onUnreadChanged: (count) {
                if (mounted) setState(() => _unreadNotifications = count);
              },
              onActivityChanged: _loadActivitySummary,
            ),
          ),
        )
        .then((_) => _loadActivitySummary());
  }

  void _selectNavigation(_NavigationData data, int index) {
    setState(() => _currentIndex = index);
    if (data.items[index].destination == _NavigationDestination.orders) {
      _loadActivitySummary();
    }
  }

  void _openAccount() {
    final user = widget.user;
    if (user == null) return;
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => AccountHubScreen(user: user)));
  }

  @override
  Widget build(BuildContext context) {
    final data = _navigationData(context);
    final safeIndex = _currentIndex < data.items.length ? _currentIndex : 0;

    return LayoutBuilder(
      builder: (context, constraints) {
        final isDesktop = constraints.maxWidth >= 1024;
        if (isDesktop) {
          return Scaffold(
            body: Row(
              children: [
                _DesktopSidebar(
                  user: widget.user,
                  items: data.items,
                  currentIndex: safeIndex,
                  onTap: (index) => _selectNavigation(data, index),
                  onLogin: _openLogin,
                  onAccount: _openAccount,
                  onLogout: () => context.read<AuthCubit>().logout(),
                ),
                Expanded(
                  child: Column(
                    children: [
                      _DesktopHeader(
                        title: data.items[safeIndex].label,
                        user: widget.user,
                        isArabic: context.locale.languageCode == 'ar',
                        onToggleLocale: _toggleLocale,
                        onNotifications: _openNotifications,
                        onAccount: _openAccount,
                        onLogin: _openLogin,
                        unreadNotifications: _unreadNotifications,
                      ),
                      Expanded(
                        child: ColoredBox(
                          color: AppColors.background,
                          child: LayoutBuilder(
                            builder: (context, bodyConstraints) => Center(
                              child: SizedBox(
                                width: math.min(bodyConstraints.maxWidth, 1440),
                                height: bodyConstraints.maxHeight,
                                child: Padding(
                                  padding: const EdgeInsets.fromLTRB(
                                    18,
                                    12,
                                    18,
                                    18,
                                  ),
                                  child: IndexedStack(
                                    index: safeIndex,
                                    children: data.screens,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        }

        return Scaffold(
          backgroundColor: AppColors.background,
          extendBody: true,
          appBar: _MobileAppBar(
            user: widget.user,
            isArabic: context.locale.languageCode == 'ar',
            onToggleLocale: _toggleLocale,
            onLogin: _openLogin,
            onNotifications: _openNotifications,
            onAccount: _openAccount,
            onLogout: () => context.read<AuthCubit>().logout(),
            unreadNotifications: _unreadNotifications,
          ),
          body: IndexedStack(index: safeIndex, children: data.screens),
          bottomNavigationBar: _MobileNavigation(
            items: data.items,
            currentIndex: safeIndex,
            onTap: (index) => _selectNavigation(data, index),
          ),
        );
      },
    );
  }
}

class _NavigationData {
  final List<Widget> screens;
  final List<_NavItem> items;

  const _NavigationData({required this.screens, required this.items});
}

enum _NavigationDestination { other, orders, chat }

class _NavItem {
  final IconData activeIcon;
  final IconData icon;
  final String label;
  final _NavigationDestination destination;
  final int badgeCount;

  const _NavItem(
    this.activeIcon,
    this.icon,
    this.label, {
    this.destination = _NavigationDestination.other,
    this.badgeCount = 0,
  });
}

class _BrandMark extends StatelessWidget {
  final bool compact;
  final bool onDark;

  const _BrandMark({this.compact = false, this.onDark = false});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: compact ? 36 : 42,
          height: compact ? 36 : 42,
          decoration: BoxDecoration(
            color: onDark ? Colors.white : AppColors.navy,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(
            Icons.handshake_rounded,
            size: compact ? 20 : 23,
            color: onDark ? AppColors.navy : Colors.white,
          ),
        ),
        const SizedBox(width: 11),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'SEALS',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                color: onDark ? Colors.white : AppColors.navy,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.1,
              ),
            ),
            if (!compact)
              Text(
                'B2B MARKETPLACE',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: onDark ? Colors.white60 : AppColors.muted,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.25,
                  fontSize: 9,
                ),
              ),
          ],
        ),
      ],
    );
  }
}

class _DesktopSidebar extends StatelessWidget {
  final AuthUserModel? user;
  final List<_NavItem> items;
  final int currentIndex;
  final ValueChanged<int> onTap;
  final VoidCallback onLogin;
  final VoidCallback onAccount;
  final VoidCallback onLogout;

  const _DesktopSidebar({
    required this.user,
    required this.items,
    required this.currentIndex,
    required this.onTap,
    required this.onLogin,
    required this.onAccount,
    required this.onLogout,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 272,
      color: AppColors.navy,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 24, 18, 18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 10),
                child: _BrandMark(onDark: true),
              ),
              const SizedBox(height: 34),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Text(
                  tr('dashboard').toUpperCase(),
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: Colors.white38,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.2,
                  ),
                ),
              ),
              const SizedBox(height: 10),
              ...List.generate(items.length, (index) {
                final item = items[index];
                final selected = index == currentIndex;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Material(
                    color: selected
                        ? Colors.white.withValues(alpha: 0.12)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(12),
                    child: InkWell(
                      onTap: () => onTap(index),
                      borderRadius: BorderRadius.circular(12),
                      child: Semantics(
                        button: true,
                        selected: selected,
                        label: item.badgeCount > 0
                            ? tr('nav_orders_action_needed', namedArgs: {
                                'label': item.label,
                                'count': '${item.badgeCount}',
                              })
                            : item.label,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 12,
                          ),
                          child: Row(
                            children: [
                              ExcludeSemantics(
                                child: Icon(
                                  selected ? item.activeIcon : item.icon,
                                  color: selected
                                      ? Colors.white
                                      : Colors.white60,
                                  size: 21,
                                ),
                              ),
                              const SizedBox(width: 13),
                              Expanded(
                                child: Text(
                                  item.label,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context).textTheme.bodyMedium
                                      ?.copyWith(
                                        color: selected
                                            ? Colors.white
                                            : Colors.white70,
                                        fontWeight: selected
                                            ? FontWeight.w700
                                            : FontWeight.w500,
                                      ),
                                ),
                              ),
                              if (item.badgeCount > 0)
                                _InlineCountBadge(
                                  count: item.badgeCount,
                                  onDark: true,
                                )
                              else if (selected)
                                Container(
                                  width: 5,
                                  height: 5,
                                  decoration: const BoxDecoration(
                                    color: AppColors.primaryBright,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              }),
              const Spacer(),
              const Divider(color: Colors.white12),
              const SizedBox(height: 14),
              if (user == null)
                ElevatedButton.icon(
                  onPressed: onLogin,
                  icon: const Icon(Icons.login_rounded, size: 19),
                  label: Text(tr('sign_in')),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: AppColors.navy,
                  ),
                )
              else
                _SidebarAccount(
                  user: user!,
                  onAccount: onAccount,
                  onLogout: onLogout,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SidebarAccount extends StatelessWidget {
  final AuthUserModel user;
  final VoidCallback onAccount;
  final VoidCallback onLogout;

  const _SidebarAccount({
    required this.user,
    required this.onAccount,
    required this.onLogout,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onAccount,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              CircleAvatar(
                radius: 19,
                backgroundColor: AppColors.primaryBright,
                child: Text(
                  user.name.trim().isEmpty
                      ? 'S'
                      : user.name.trim()[0].toUpperCase(),
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      user.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      user.role.displayName,
                      maxLines: 1,
                      style: const TextStyle(
                        color: Colors.white54,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: onLogout,
                tooltip: tr('sign_out'),
                visualDensity: VisualDensity.compact,
                icon: const Icon(
                  Icons.logout_rounded,
                  color: Colors.white60,
                  size: 19,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DesktopHeader extends StatelessWidget {
  final String title;
  final AuthUserModel? user;
  final bool isArabic;
  final VoidCallback onToggleLocale;
  final VoidCallback onNotifications;
  final VoidCallback onAccount;
  final VoidCallback onLogin;
  final int unreadNotifications;

  const _DesktopHeader({
    required this.title,
    required this.user,
    required this.isArabic,
    required this.onToggleLocale,
    required this.onNotifications,
    required this.onAccount,
    required this.onLogin,
    required this.unreadNotifications,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 76,
      padding: const EdgeInsets.symmetric(horizontal: 28),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 2),
                Text(
                  user == null
                      ? tr('nav_header_guest')
                      : tr('nav_header_signed_in'),
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: AppColors.muted),
                ),
              ],
            ),
          ),
          _HeaderAction(
            tooltip: isArabic ? tr('english') : tr('arabic'),
            onTap: onToggleLocale,
            child: Text(
              isArabic ? 'EN' : 'ع',
              style: const TextStyle(
                color: AppColors.primary,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          const SizedBox(width: 8),
          if (user != null) ...[
            _HeaderAction(
              tooltip: tr('notifications'),
              onTap: onNotifications,
              child: _NotificationIcon(
                unreadCount: unreadNotifications,
                color: AppColors.ink,
              ),
            ),
            const SizedBox(width: 8),
            _HeaderAction(
              tooltip: tr('profile'),
              onTap: onAccount,
              child: const Icon(
                Icons.person_outline_rounded,
                color: AppColors.ink,
                size: 21,
              ),
            ),
          ] else
            ElevatedButton.icon(
              onPressed: onLogin,
              icon: const Icon(Icons.login_rounded, size: 18),
              label: Text(tr('sign_in')),
            ),
        ],
      ),
    );
  }
}

class _HeaderAction extends StatelessWidget {
  final String tooltip;
  final VoidCallback onTap;
  final Widget child;

  const _HeaderAction({
    required this.tooltip,
    required this.onTap,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(11),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(11),
          child: SizedBox(width: 48, height: 48, child: Center(child: child)),
        ),
      ),
    );
  }
}

class _NotificationIcon extends StatelessWidget {
  final int unreadCount;
  final Color? color;

  const _NotificationIcon({required this.unreadCount, this.color});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: unreadCount > 0
          ? tr('nav_notifications_unread', namedArgs: {
              'count': '$unreadCount',
            })
          : tr('nav_notifications_none'),
      child: ExcludeSemantics(
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Icon(
              unreadCount > 0
                  ? Icons.notifications_rounded
                  : Icons.notifications_none_rounded,
              color: color,
              size: 22,
            ),
            if (unreadCount > 0)
              PositionedDirectional(
                top: -8,
                end: -11,
                child: Container(
                  constraints: const BoxConstraints(
                    minWidth: 18,
                    minHeight: 18,
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  decoration: BoxDecoration(
                    color: Colors.red.shade700,
                    borderRadius: BorderRadius.circular(99),
                    border: Border.all(color: Colors.white, width: 1.5),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    unreadCount > 99 ? '99+' : '$unreadCount',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _MobileAppBar extends StatelessWidget implements PreferredSizeWidget {
  final AuthUserModel? user;
  final bool isArabic;
  final VoidCallback onToggleLocale;
  final VoidCallback onLogin;
  final VoidCallback onNotifications;
  final VoidCallback onAccount;
  final VoidCallback onLogout;
  final int unreadNotifications;

  const _MobileAppBar({
    required this.user,
    required this.isArabic,
    required this.onToggleLocale,
    required this.onLogin,
    required this.onNotifications,
    required this.onAccount,
    required this.onLogout,
    required this.unreadNotifications,
  });

  @override
  Size get preferredSize => const Size.fromHeight(64);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      toolbarHeight: 64,
      titleSpacing: 16,
      title: const _BrandMark(compact: true),
      actions: [
        if (user != null)
          IconButton(
            onPressed: onNotifications,
            tooltip: tr('notifications'),
            icon: _NotificationIcon(unreadCount: unreadNotifications),
          ),
        TextButton(
          onPressed: onToggleLocale,
          child: Text(isArabic ? 'EN' : 'ع'),
        ),
        if (user == null)
          Padding(
            padding: const EdgeInsetsDirectional.only(end: 12),
            child: ElevatedButton(
              onPressed: onLogin,
              child: Text(tr('sign_in')),
            ),
          )
        else
          PopupMenuButton<String>(
            tooltip: tr('profile'),
            onSelected: (value) =>
                value == 'account' ? onAccount() : onLogout(),
            itemBuilder: (context) => [
              PopupMenuItem(value: 'account', child: Text(tr('profile'))),
              PopupMenuItem(value: 'logout', child: Text(tr('sign_out'))),
            ],
            icon: const Icon(Icons.account_circle_outlined),
          ),
      ],
    );
  }
}

class _MobileNavigation extends StatelessWidget {
  final List<_NavItem> items;
  final int currentIndex;
  final ValueChanged<int> onTap;

  const _MobileNavigation({
    required this.items,
    required this.currentIndex,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: AppColors.navy.withValues(alpha: 0.08),
            blurRadius: 24,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 7),
          child: Row(
            children: List.generate(items.length, (index) {
              final item = items[index];
              final selected = currentIndex == index;
              return Expanded(
                child: Semantics(
                  button: true,
                  selected: selected,
                  label: item.badgeCount > 0
                      ? tr('nav_orders_action_needed', namedArgs: {
                          'label': item.label,
                          'count': '${item.badgeCount}',
                        })
                      : item.label,
                  child: InkWell(
                    onTap: () => onTap(index),
                    borderRadius: BorderRadius.circular(12),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      padding: const EdgeInsets.symmetric(
                        vertical: 8,
                        horizontal: 3,
                      ),
                      decoration: BoxDecoration(
                        color: selected
                            ? const Color(0xFFE4F2F0)
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          ExcludeSemantics(
                            child: Stack(
                              clipBehavior: Clip.none,
                              children: [
                                Icon(
                                  selected ? item.activeIcon : item.icon,
                                  color: selected
                                      ? AppColors.primary
                                      : AppColors.muted,
                                  size: 22,
                                ),
                                if (item.badgeCount > 0)
                                  PositionedDirectional(
                                    top: -10,
                                    end: -15,
                                    child: _InlineCountBadge(
                                      count: item.badgeCount,
                                      compact: true,
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            item.label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: selected
                                  ? AppColors.primary
                                  : AppColors.muted,
                              fontSize: 10,
                              fontWeight: selected
                                  ? FontWeight.w700
                                  : FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}

class _InlineCountBadge extends StatelessWidget {
  final int count;
  final bool compact;
  final bool onDark;

  const _InlineCountBadge({
    required this.count,
    this.compact = false,
    this.onDark = false,
  });

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: Container(
        constraints: BoxConstraints(
          minWidth: compact ? 18 : 24,
          minHeight: compact ? 18 : 22,
        ),
        padding: EdgeInsets.symmetric(horizontal: compact ? 4 : 7),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: onDark ? AppColors.primaryBright : Colors.red.shade700,
          borderRadius: BorderRadius.circular(99),
          border: compact ? Border.all(color: Colors.white, width: 1.5) : null,
        ),
        child: Text(
          count > 99 ? '99+' : '$count',
          style: TextStyle(
            color: onDark ? AppColors.navy : Colors.white,
            fontSize: compact ? 9 : 11,
            height: 1,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
    );
  }
}
