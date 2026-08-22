import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/cart_item_model.dart';

/// Persists the pre-login cart. On Flutter Web SharedPreferences uses browser localStorage.
class LocalCartService {
  static const _storageKey = 'seals_local_cart_v1';

  Future<List<CartItemModel>> load() async {
    final preferences = await SharedPreferences.getInstance();
    final raw = preferences.getString(_storageKey);
    if (raw == null || raw.isEmpty) return const [];
    try {
      return (jsonDecode(raw) as List<dynamic>)
          .map(
            (item) => CartItemModel.fromLocalJson(
              Map<String, dynamic>.from(item as Map),
            ),
          )
          .where((item) => item.productId.isNotEmpty)
          .toList();
    } catch (_) {
      await preferences.remove(_storageKey);
      return const [];
    }
  }

  Future<List<CartItemModel>> add(CartItemModel product) async {
    final items = [...await load()];
    final index = items.indexWhere(
      (item) => item.productId == product.productId,
    );
    if (index == -1) {
      items.add(product.copyWith(quantity: product.minOrderQuantity));
    } else {
      items[index] = items[index].copyWith(
        quantity: items[index].quantity + product.minOrderQuantity,
      );
    }
    await _save(items);
    return items;
  }

  Future<List<CartItemModel>> setQuantity(
    String productId,
    int quantity,
  ) async {
    final items = [...await load()];
    final index = items.indexWhere((item) => item.productId == productId);
    if (index >= 0 && quantity >= items[index].minOrderQuantity) {
      items[index] = items[index].copyWith(quantity: quantity);
      await _save(items);
    }
    return items;
  }

  Future<List<CartItemModel>> remove(String productId) async {
    final items = [...await load()]
      ..removeWhere((item) => item.productId == productId);
    await _save(items);
    return items;
  }

  Future<void> clear() async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_storageKey);
  }

  Future<void> _save(List<CartItemModel> items) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(
      _storageKey,
      jsonEncode(items.map((item) => item.toLocalJson()).toList()),
    );
  }
}
