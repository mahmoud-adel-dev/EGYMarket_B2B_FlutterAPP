class CartItemModel {
  final String id;
  final String productId;
  final String productName;
  final String productImageUrl;
  final List<String> productImageUrls;
  final List<String> productVideoUrls;
  final int unitPricePiasters;
  final int quantity;
  final int minOrderQuantity;
  final String sellerOrganizationId;
  final String sellerName;
  final String sellerGovernorate;

  const CartItemModel({
    required this.id,
    required this.productId,
    required this.productName,
    required this.productImageUrl,
    this.productImageUrls = const [],
    this.productVideoUrls = const [],
    required this.unitPricePiasters,
    required this.quantity,
    required this.minOrderQuantity,
    required this.sellerOrganizationId,
    this.sellerName = '',
    this.sellerGovernorate = '',
  });

  int get subtotalPiasters => unitPricePiasters * quantity;
  double get unitPrice => unitPricePiasters / 100;
  double get subtotal => subtotalPiasters / 100;
  bool get isAtMoqLimit => quantity <= minOrderQuantity;

  CartItemModel copyWith({int? quantity}) => CartItemModel(
    id: id,
    productId: productId,
    productName: productName,
    productImageUrl: productImageUrl,
    productImageUrls: productImageUrls,
    productVideoUrls: productVideoUrls,
    unitPricePiasters: unitPricePiasters,
    quantity: quantity ?? this.quantity,
    minOrderQuantity: minOrderQuantity,
    sellerOrganizationId: sellerOrganizationId,
    sellerName: sellerName,
    sellerGovernorate: sellerGovernorate,
  );

  factory CartItemModel.fromCartJson(Map<String, dynamic> json) {
    final product = json['product'] as Map<String, dynamic>? ?? {};
    final organization =
        product['organization_id'] as Map<String, dynamic>? ?? {};
    final location = organization['location'] as Map<String, dynamic>? ?? {};
    final images = product['images'] as List<dynamic>? ?? const [];
    return CartItemModel(
      id: product['_id']?.toString() ?? json['product_id']?.toString() ?? '',
      productId:
          product['_id']?.toString() ?? json['product_id']?.toString() ?? '',
      productName: product['title']?.toString() ?? '',
      productImageUrl: images.isNotEmpty ? images.first.toString() : '',
      productImageUrls: images.map((value) => value.toString()).toList(),
      productVideoUrls: (product['video_urls'] as List<dynamic>? ?? const [])
          .map((value) => value.toString())
          .toList(),
      unitPricePiasters: (json['unit_price_piasters'] as num?)?.toInt() ?? 0,
      quantity: (json['quantity'] as num?)?.toInt() ?? 1,
      minOrderQuantity: (product['moq'] as num?)?.toInt() ?? 1,
      sellerOrganizationId: organization['_id']?.toString() ?? '',
      sellerName: organization['display_name']?.toString() ?? '',
      sellerGovernorate: location['governorate']?.toString() ?? '',
    );
  }

  factory CartItemModel.fromProductJson(Map<String, dynamic> product) {
    final organization =
        product['organization_id'] as Map<String, dynamic>? ?? {};
    final location = organization['location'] as Map<String, dynamic>? ?? {};
    final images = product['images'] as List<dynamic>? ?? const [];
    final price = (product['price_piasters'] as num?)?.toInt() ?? 0;
    final moq = (product['moq'] as num?)?.toInt() ?? 1;
    return CartItemModel(
      id: product['_id']?.toString() ?? '',
      productId: product['_id']?.toString() ?? '',
      productName: product['title']?.toString() ?? '',
      productImageUrl: images.isNotEmpty ? images.first.toString() : '',
      productImageUrls: images.map((value) => value.toString()).toList(),
      productVideoUrls: (product['video_urls'] as List<dynamic>? ?? const [])
          .map((value) => value.toString())
          .toList(),
      unitPricePiasters: price,
      quantity: moq,
      minOrderQuantity: moq,
      sellerOrganizationId: organization['_id']?.toString() ?? '',
      sellerName: organization['display_name']?.toString() ?? '',
      sellerGovernorate: location['governorate']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toLocalJson() => {
    'id': id,
    'product_id': productId,
    'product_name': productName,
    'product_image_url': productImageUrl,
    'product_image_urls': productImageUrls,
    'product_video_urls': productVideoUrls,
    'unit_price_piasters': unitPricePiasters,
    'quantity': quantity,
    'min_order_quantity': minOrderQuantity,
    'seller_organization_id': sellerOrganizationId,
    'seller_name': sellerName,
    'seller_governorate': sellerGovernorate,
  };

  factory CartItemModel.fromLocalJson(Map<String, dynamic> json) {
    return CartItemModel(
      id: json['id']?.toString() ?? json['product_id']?.toString() ?? '',
      productId: json['product_id']?.toString() ?? '',
      productName: json['product_name']?.toString() ?? '',
      productImageUrl: json['product_image_url']?.toString() ?? '',
      productImageUrls:
          (json['product_image_urls'] as List<dynamic>? ?? const [])
              .map((value) => value.toString())
              .toList(),
      productVideoUrls:
          (json['product_video_urls'] as List<dynamic>? ?? const [])
              .map((value) => value.toString())
              .toList(),
      unitPricePiasters: (json['unit_price_piasters'] as num?)?.toInt() ?? 0,
      quantity: (json['quantity'] as num?)?.toInt() ?? 1,
      minOrderQuantity: (json['min_order_quantity'] as num?)?.toInt() ?? 1,
      sellerOrganizationId: json['seller_organization_id']?.toString() ?? '',
      sellerName: json['seller_name']?.toString() ?? '',
      sellerGovernorate: json['seller_governorate']?.toString() ?? '',
    );
  }
}
