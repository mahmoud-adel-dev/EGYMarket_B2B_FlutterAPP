import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:seals_app/features/cart/data/models/cart_item_model.dart';
import 'package:seals_app/features/cart/data/services/local_cart_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'guest cart persists products and quantities in local storage',
    () async {
      SharedPreferences.setMockInitialValues({});
      final service = LocalCartService();
      const product = CartItemModel(
        id: 'product-1',
        productId: 'product-1',
        productName: 'Test product',
        productImageUrl: 'https://example.com/product.jpg',
        unitPricePiasters: 2500,
        quantity: 5,
        minOrderQuantity: 5,
        sellerOrganizationId: 'seller-1',
      );

      await service.add(product);
      await service.add(product);
      final restored = await service.load();

      expect(restored, hasLength(1));
      expect(restored.single.productId, 'product-1');
      expect(restored.single.quantity, 10);
    },
  );
}
