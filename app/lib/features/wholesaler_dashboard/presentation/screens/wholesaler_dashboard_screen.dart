import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/network/network_manager.dart';
import '../../../products/presentation/screens/seller_products_screen.dart';
import '../../../profile/presentation/screens/role_based_profile_screen.dart';
import 'profit_report_screen.dart';

class WholesalerDashboardScreen extends StatefulWidget {
  const WholesalerDashboardScreen({super.key});

  @override
  State<WholesalerDashboardScreen> createState() =>
      _WholesalerDashboardScreenState();
}

class _WholesalerDashboardScreenState extends State<WholesalerDashboardScreen> {
  bool _isLoading = true;
  String? _error;
  Map<String, dynamic>? _metrics;
  Map<String, dynamic>? _profile;
  int _requestGeneration = 0;

  late final INetworkManager _networkManager;

  @override
  void initState() {
    super.initState();
    _networkManager = ServiceLocator.network();
    _fetchData();
  }

  Future<void> _fetchData() async {
    if (!mounted) return;
    final requestGeneration = ++_requestGeneration;
    try {
      setState(() {
        _isLoading = true;
        _error = null;
      });
      final results = await Future.wait([
        _networkManager.get<Map<String, dynamic>>('/dashboard/wholesaler'),
        _networkManager
            .get<Map<String, dynamic>>('/profile')
            .catchError((_) => <String, dynamic>{}),
      ]);
      if (!mounted || requestGeneration != _requestGeneration) return;
      setState(() {
        _metrics = results[0]['metrics'] as Map<String, dynamic>?;
        _profile = (results[1]['user'] as Map<String, dynamic>?) ?? results[1];
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted || requestGeneration != _requestGeneration) return;
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  @override
  void dispose() {
    _requestGeneration++;
    super.dispose();
  }

  String _getGreeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FA),
      body: _isLoading
          ? _buildSkeleton()
          : _error != null
          ? _buildError()
          : _buildContent(),
    );
  }

  Widget _buildSkeleton() {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 56, 20, 24),
      child: Column(children: List.generate(4, (_) => _SkeletonCard())),
    );
  }

  Widget _buildError() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xFFFFE5EE),
              borderRadius: BorderRadius.circular(24),
            ),
            child: const Icon(
              Icons.wifi_off_rounded,
              size: 48,
              color: Color(0xFFFF6B9D),
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'Could not load dashboard',
            style: TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 16,
              color: Color(0xFF1A1D3B),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Check your connection and try again',
            style: TextStyle(color: Colors.grey[500], fontSize: 13),
          ),
          const SizedBox(height: 20),
          ElevatedButton.icon(
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Retry'),
            onPressed: _fetchData,
          ),
        ],
      ),
    );
  }

  Widget _buildContent() {
    final totalOrders = (_metrics?['total_orders'] as num?)?.toInt() ?? 0;
    final activeOrders = (_metrics?['active_orders'] as num?)?.toInt() ?? 0;
    final totalProducts = (_metrics?['total_products'] as num?)?.toInt() ?? 0;
    final totalRevenuePiasters =
        (_metrics?['confirmed_revenue_piasters'] as num?)?.toInt() ?? 0;
    final userName =
        _profile?['name'] as String? ??
        _profile?['business_name'] as String? ??
        'there';
    final firstName = userName.split(' ').first;

    return RefreshIndicator(
      color: const Color(0xFF6C63FF),
      onRefresh: _fetchData,
      child: CustomScrollView(
        slivers: [
          // ── Top Header ──────────────────────────────────────
          SliverToBoxAdapter(
            child: Container(
              padding: const EdgeInsets.fromLTRB(20, 56, 20, 28),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${_getGreeting()}, 👋',
                          style: TextStyle(
                            color: Colors.grey[500],
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          firstName,
                          style: GoogleFonts.poppins(
                            fontSize: 26,
                            fontWeight: FontWeight.w700,
                            color: const Color(0xFF1A1D3B),
                          ),
                        ),
                      ],
                    ),
                  ),
                  // Avatar
                  GestureDetector(
                    onTap: _fetchData,
                    child: Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: const LinearGradient(
                          colors: [Color(0xFF6C63FF), Color(0xFF9C8FFF)],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(
                              0xFF6C63FF,
                            ).withValues(alpha: 0.35),
                            blurRadius: 12,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: const Icon(
                        Icons.storefront_rounded,
                        color: Colors.white,
                        size: 24,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // ── Stats Row ────────────────────────────────────────
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Overview',
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF1A1D3B),
                    ),
                  ),
                  const SizedBox(height: 14),
                  // 2×2 grid of metric cards
                  Row(
                    children: [
                      Expanded(
                        child: _MetricCard(
                          label: 'Revenue',
                          value:
                              '${_formatNum(totalRevenuePiasters / 100)} EGP',
                          icon: Icons.trending_up_rounded,
                          bgColor: const Color(0xFFEEEBFF),
                          iconColor: const Color(0xFF6C63FF),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: _MetricCard(
                          label: 'Active Orders',
                          value: '$activeOrders',
                          icon: Icons.local_shipping_rounded,
                          bgColor: const Color(0xFFFFE8F3),
                          iconColor: const Color(0xFFFF6B9D),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: _MetricCard(
                          label: 'Products',
                          value: '$totalProducts',
                          icon: Icons.inventory_2_rounded,
                          bgColor: const Color(0xFFE6FAF9),
                          iconColor: const Color(0xFF4ECDC4),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: _MetricCard(
                          label: 'Total Orders',
                          value: '$totalOrders',
                          icon: Icons.receipt_long_rounded,
                          bgColor: const Color(0xFFFFF3E0),
                          iconColor: const Color(0xFFFF9800),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),

          const SliverToBoxAdapter(child: SizedBox(height: 28)),

          // ── Quick Actions ────────────────────────────────────
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Quick Actions',
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF1A1D3B),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      _QuickAction(
                        icon: Icons.add_box_rounded,
                        label: 'Add Product',
                        color: const Color(0xFF6C63FF),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const SellerProductsScreen(),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      _QuickAction(
                        icon: Icons.inventory_rounded,
                        label: 'Inventory',
                        color: const Color(0xFF4ECDC4),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const SellerProductsScreen(),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      _QuickAction(
                        icon: Icons.bar_chart_rounded,
                        label: 'Analytics',
                        color: const Color(0xFFFF9800),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const ProfitReportScreen(),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      _QuickAction(
                        icon: Icons.settings_rounded,
                        label: 'Settings',
                        color: const Color(0xFFFF6B9D),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const RoleBasedProfileScreen(),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),

          const SliverToBoxAdapter(child: SizedBox(height: 28)),

          // ── Status Summary ───────────────────────────────────
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Order Status',
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF1A1D3B),
                    ),
                  ),
                  const SizedBox(height: 14),
                  _OrderStatusCard(
                    label: 'In Progress',
                    count: activeOrders,
                    color: const Color(0xFF6C63FF),
                    bgColor: const Color(0xFFEEEBFF),
                  ),
                  const SizedBox(height: 10),
                  _OrderStatusCard(
                    label: 'Completed',
                    count: totalOrders - activeOrders < 0
                        ? 0
                        : totalOrders - activeOrders,
                    color: const Color(0xFF4ECDC4),
                    bgColor: const Color(0xFFE6FAF9),
                  ),
                ],
              ),
            ),
          ),

          const SliverToBoxAdapter(child: SizedBox(height: 100)),
        ],
      ),
    );
  }

  String _formatNum(dynamic val) {
    try {
      return NumberFormat(
        '#,##0.##',
      ).format(val is num ? val : num.parse(val.toString()));
    } catch (_) {
      return val.toString();
    }
  }
}

// ── Metric Card ─────────────────────────────────────────────────────────────
class _MetricCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color bgColor;
  final Color iconColor;

  const _MetricCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.bgColor,
    required this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A000000),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: bgColor,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: iconColor, size: 22),
          ),
          const SizedBox(height: 14),
          Text(
            value,
            style: GoogleFonts.poppins(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: const Color(0xFF1A1D3B),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(
              color: Colors.grey[500],
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Quick Action Button ─────────────────────────────────────────────────────
class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _QuickAction({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Column(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(icon, color: color, size: 24),
            ),
            const SizedBox(height: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: Colors.grey[600],
              ),
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

// ── Order Status Card ────────────────────────────────────────────────────────
class _OrderStatusCard extends StatelessWidget {
  final String label;
  final int count;
  final Color color;
  final Color bgColor;

  const _OrderStatusCard({
    required this.label,
    required this.count,
    required this.color,
    required this.bgColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(
            color: Color(0x08000000),
            blurRadius: 10,
            offset: Offset(0, 3),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 14,
                color: Color(0xFF1A1D3B),
              ),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: bgColor,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              '$count orders',
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.w700,
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Skeleton Loader ──────────────────────────────────────────────────────────
class _SkeletonCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      height: 80,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
      ),
    );
  }
}
