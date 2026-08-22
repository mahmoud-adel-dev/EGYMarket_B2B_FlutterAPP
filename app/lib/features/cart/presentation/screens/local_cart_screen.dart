import 'package:flutter/material.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../auth/presentation/utils/auth_action_guard.dart';
import '../../data/models/cart_item_model.dart';
import '../../data/services/local_cart_service.dart';
import 'cart_screen.dart';

class LocalCartScreen extends StatefulWidget {
  const LocalCartScreen({super.key});

  @override
  State<LocalCartScreen> createState() => _LocalCartScreenState();
}

class _LocalCartScreenState extends State<LocalCartScreen> {
  final _localCart = LocalCartService();
  List<CartItemModel> _items = const [];
  bool _loading = true;
  bool _syncing = false;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    final items = await _localCart.load();
    if (mounted) {
      setState(() {
        _items = items;
        _loading = false;
      });
    }
  }

  Future<void> _setQuantity(CartItemModel item, int quantity) async {
    if (quantity < item.minOrderQuantity) return;
    final items = await _localCart.setQuantity(item.productId, quantity);
    if (mounted) setState(() => _items = items);
  }

  Future<void> _remove(String productId) async {
    final items = await _localCart.remove(productId);
    if (mounted) setState(() => _items = items);
  }

  Future<void> _continueToCheckout() async {
    if (_items.isEmpty) {
      final buyer = await requireBuyer(
        context,
        actionLabel: 'فتح السلة وإتمام الشراء',
      );
      if (buyer != null && mounted) {
        await Navigator.of(
          context,
        ).push(MaterialPageRoute(builder: (_) => const CartScreen()));
      }
      return;
    }
    if (_items.map((item) => item.sellerOrganizationId).toSet().length > 1) {
      ErrorHandler.showSecureSnackBar(
        context,
        'يجب إتمام طلب مستقل لكل بائع. اترك منتجات بائع واحد في السلة أولًا.',
        isError: true,
      );
      return;
    }
    final buyer = await requireBuyer(context, actionLabel: 'إتمام طلب الشراء');
    if (buyer == null || !mounted) return;

    setState(() => _syncing = true);
    try {
      final network = ServiceLocator.network();
      for (final item in _items) {
        await network.post<Map<String, dynamic>>(
          '/cart',
          data: {'product_id': item.productId, 'quantity': item.quantity},
        );
      }
      await _localCart.clear();
      if (!mounted) return;
      setState(() => _items = const []);
      await Navigator.of(
        context,
      ).push(MaterialPageRoute(builder: (_) => const CartScreen()));
    } catch (error) {
      if (mounted) {
        ErrorHandler.showSecureSnackBar(
          context,
          ErrorHandler.getUserFriendlyMessage(error),
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final total = _items.fold<int>(
      0,
      (sum, item) => sum + item.subtotalPiasters,
    );
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(title: const Text('سلة المشتريات')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Container(
                  width: double.infinity,
                  color: const Color(0xFFE4F2F0),
                  padding: const EdgeInsets.all(12),
                  child: const Text(
                    'تُحفظ هذه السلة على جهازك. يمكنك إضافة المنتجات دون حساب، وسيُطلب تسجيل الدخول عند إتمام الشراء فقط.',
                    textAlign: TextAlign.center,
                  ),
                ),
                Expanded(
                  child: _items.isEmpty
                      ? const Center(
                          child: Text(
                            'السلة المحلية فارغة. أضف منتجات من الكتالوج.',
                          ),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.all(16),
                          itemCount: _items.length,
                          separatorBuilder: (_, _) =>
                              const SizedBox(height: 10),
                          itemBuilder: (context, index) {
                            final item = _items[index];
                            return Card(
                              child: Padding(
                                padding: const EdgeInsets.all(12),
                                child: Row(
                                  children: [
                                    ClipRRect(
                                      borderRadius: BorderRadius.circular(10),
                                      child: item.productImageUrl.isEmpty
                                          ? const SizedBox(
                                              width: 72,
                                              height: 72,
                                              child: Icon(
                                                Icons.inventory_2_outlined,
                                              ),
                                            )
                                          : Image.network(
                                              item.productImageUrl,
                                              width: 72,
                                              height: 72,
                                              fit: BoxFit.cover,
                                              errorBuilder: (_, _, _) =>
                                                  const SizedBox(
                                                    width: 72,
                                                    height: 72,
                                                    child: Icon(
                                                      Icons
                                                          .inventory_2_outlined,
                                                    ),
                                                  ),
                                            ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            item.productName,
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w800,
                                            ),
                                          ),
                                          Text(item.sellerName),
                                          Text(
                                            '${item.subtotal.toStringAsFixed(2)} ج.م',
                                          ),
                                        ],
                                      ),
                                    ),
                                    Column(
                                      children: [
                                        Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            IconButton(
                                              onPressed:
                                                  item.quantity <=
                                                      item.minOrderQuantity
                                                  ? null
                                                  : () => _setQuantity(
                                                      item,
                                                      item.quantity - 1,
                                                    ),
                                              icon: const Icon(
                                                Icons.remove_circle_outline,
                                              ),
                                            ),
                                            Text('${item.quantity}'),
                                            IconButton(
                                              onPressed: () => _setQuantity(
                                                item,
                                                item.quantity + 1,
                                              ),
                                              icon: const Icon(
                                                Icons.add_circle_outline,
                                              ),
                                            ),
                                          ],
                                        ),
                                        TextButton.icon(
                                          onPressed: () =>
                                              _remove(item.productId),
                                          icon: const Icon(
                                            Icons.delete_outline,
                                            size: 17,
                                          ),
                                          label: const Text('حذف'),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                ),
                SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          'الإجمالي المحلي: ${(total / 100).toStringAsFixed(2)} ج.م',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 8),
                        FilledButton.icon(
                          onPressed: _syncing ? null : _continueToCheckout,
                          icon: _syncing
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.lock_open_rounded),
                          label: Text(
                            _items.isEmpty
                                ? 'فتح سلة الحساب'
                                : 'تسجيل الدخول وإتمام الطلب',
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}
