import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../../core/network/network_manager.dart';

class ProfitReportScreen extends StatefulWidget {
  const ProfitReportScreen({super.key});

  @override
  State<ProfitReportScreen> createState() => _ProfitReportScreenState();
}

class _ProfitReportScreenState extends State<ProfitReportScreen> {
  late final INetworkManager _network;
  Map<String, dynamic>? _report;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _network = ServiceLocator.network();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await _network.get<Map<String, dynamic>>(
        '/dashboard/wholesaler',
      );
      if (mounted) {
        setState(() => _report = response['report'] as Map<String, dynamic>?);
      }
    } catch (error) {
      if (mounted) {
        setState(() => _error = ErrorHandler.getUserFriendlyMessage(error));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _money(dynamic piasters) => tr(
    'price',
    namedArgs: {
      'price': NumberFormat('#,##0.00').format(((piasters as num?) ?? 0) / 100),
    },
  );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('profit_report_title'))),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(_error!),
                  const SizedBox(height: 12),
                  FilledButton(onPressed: _load, child: Text(tr('retry'))),
                ],
              ),
            )
          : _buildReport(),
    );
  }

  Widget _buildReport() {
    final sales = _report?['sales'] as Map<String, dynamic>? ?? const {};
    final inventory =
        _report?['inventory'] as Map<String, dynamic>? ?? const {};
    final monthly = _report?['monthly_sales'] as List<dynamic>? ?? const [];
    final products =
        _report?['product_performance'] as List<dynamic>? ?? const [];
    final maxMonthly = monthly.fold<num>(1, (maximum, raw) {
      final salesValue = ((raw as Map)['sales'] as num?) ?? 0;
      return salesValue > maximum ? salesValue : maximum;
    });
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
        children: [
          GridView.count(
            crossAxisCount: MediaQuery.sizeOf(context).width > 700 ? 4 : 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.25,
            children: [
              _ReportMetric(
                tr('profit_gross_sales'),
                _money(sales['gross_sales_piasters']),
                Icons.payments_outlined,
                const Color(0xFF2563EB),
              ),
              _ReportMetric(
                tr('profit_gross_profit'),
                _money(sales['gross_profit_piasters']),
                Icons.trending_up_rounded,
                const Color(0xFF059669),
              ),
              _ReportMetric(
                tr('profit_inventory_value'),
                _money(inventory['retail_value_piasters']),
                Icons.inventory_2_outlined,
                const Color(0xFF7C3AED),
              ),
              _ReportMetric(
                tr('profit_available_units'),
                '${inventory['available_units'] ?? 0}',
                Icons.warehouse_outlined,
                const Color(0xFFEA580C),
              ),
            ],
          ),
          const SizedBox(height: 20),
          _sectionTitle(tr('profit_sales_trend')),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: monthly.map((raw) {
                  final row = raw as Map;
                  final value = (row['sales'] as num?) ?? 0;
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 62,
                          child: Text(row['month']?.toString() ?? ''),
                        ),
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(99),
                            child: LinearProgressIndicator(
                              minHeight: 12,
                              value: (value / maxMonthly)
                                  .clamp(0, 1)
                                  .toDouble(),
                              backgroundColor: const Color(0xFFE2E8F0),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        SizedBox(
                          width: 95,
                          child: Text(_money(value), textAlign: TextAlign.end),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
          const SizedBox(height: 20),
          _sectionTitle(tr('profit_inventory_alerts')),
          Row(
            children: [
              Expanded(
                child: _AlertCard(
                  tr('profit_low_stock'),
                  inventory['low_stock_products'] ?? 0,
                  Colors.orange,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _AlertCard(
                  tr('product_status_out_of_stock'),
                  inventory['out_of_stock_products'] ?? 0,
                  Colors.red,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          _sectionTitle(tr('profit_product_performance')),
          ...products.map((raw) {
            final row = raw as Map;
            return Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: ExpansionTile(
                title: Text(
                  row['title']?.toString() ?? '',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: Text(
                  tr(
                    'profit_item',
                    namedArgs: {
                      'sku': row['sku']?.toString() ?? tr('profit_no_sku'),
                      'amount': _money(row['gross_profit_piasters']),
                    },
                  ),
                ),
                trailing: Text(
                  '${row['sell_through_percent'] ?? 0}%',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    child: Wrap(
                      spacing: 16,
                      runSpacing: 8,
                      children: [
                        Text(
                          tr(
                            'profit_units_sold',
                            namedArgs: {'count': row['units_sold'] ?? 0},
                          ),
                        ),
                        Text(
                          tr(
                            'profit_available',
                            namedArgs: {
                              'count': row['available_quantity'] ?? 0,
                            },
                          ),
                        ),
                        Text(
                          tr(
                            'profit_orders_count',
                            namedArgs: {'count': row['orders_count'] ?? 0},
                          ),
                        ),
                        Text(
                          tr(
                            'profit_sales_value',
                            namedArgs: {
                              'amount': _money(row['sales_piasters']),
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          }),
          const SizedBox(height: 12),
          Text(
            _report?['calculation_note']?.toString() ?? '',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: Colors.grey[600]),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String title) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Text(
      title,
      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
    ),
  );
}

class _ReportMetric extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  const _ReportMetric(this.label, this.value, this.icon, this.color);

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color),
          const Spacer(),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
          ),
          Text(label, style: TextStyle(color: Colors.grey[600], fontSize: 12)),
        ],
      ),
    ),
  );
}

class _AlertCard extends StatelessWidget {
  final String label;
  final dynamic count;
  final Color color;
  const _AlertCard(this.label, this.count, this.color);
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: color.withValues(alpha: .08),
      borderRadius: BorderRadius.circular(14),
    ),
    child: Row(
      children: [
        Icon(Icons.warning_amber_rounded, color: color),
        const SizedBox(width: 10),
        Expanded(child: Text(label)),
        Text(
          '$count',
          style: TextStyle(
            color: color,
            fontWeight: FontWeight.w900,
            fontSize: 18,
          ),
        ),
      ],
    ),
  );
}
