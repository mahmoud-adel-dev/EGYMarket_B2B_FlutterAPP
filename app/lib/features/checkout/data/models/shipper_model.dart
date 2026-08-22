class ShipperModel {
  final String rateId;
  final String organizationId;
  final String name;
  final String logoUrl;
  final int shippingFeePiasters;
  final int estimatedDays;

  const ShipperModel({
    required this.rateId,
    required this.organizationId,
    required this.name,
    required this.logoUrl,
    required this.shippingFeePiasters,
    required this.estimatedDays,
  });

  double get shippingFee => shippingFeePiasters / 100;

  factory ShipperModel.fromJson(Map<String, dynamic> json) {
    final organization = json['organization'] as Map<String, dynamic>? ?? {};
    final rate = json['rate'] as Map<String, dynamic>? ?? {};
    return ShipperModel(
      rateId: rate['_id']?.toString() ?? '',
      organizationId: organization['_id']?.toString() ?? '',
      name: organization['display_name']?.toString() ?? '',
      logoUrl: organization['avatar_url']?.toString() ?? '',
      shippingFeePiasters: (rate['price_piasters'] as num?)?.toInt() ?? 0,
      estimatedDays: (rate['estimated_days'] as num?)?.toInt() ?? 1,
    );
  }
}

enum FulfillmentMethod { buyerPickup, thirdPartyShipping }
