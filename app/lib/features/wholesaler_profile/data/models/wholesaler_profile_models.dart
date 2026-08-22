class WholesalerProfileModel {
  final String id;
  final String name;
  final String avatarUrl;
  final String coverUrl;
  final bool isVerified;
  final String totalOrders;
  final double rating;
  final int totalProducts;
  final String bio;
  final String category;

  WholesalerProfileModel({
    required this.id,
    required this.name,
    required this.avatarUrl,
    required this.coverUrl,
    required this.isVerified,
    required this.totalOrders,
    required this.rating,
    required this.totalProducts,
    required this.bio,
    required this.category,
  });

  factory WholesalerProfileModel.fromJson(Map<String, dynamic> json) {
    final data = json['wholesaler'] is Map<String, dynamic>
        ? json['wholesaler'] as Map<String, dynamic>
        : json;

    return WholesalerProfileModel(
      id: data['id'] as String? ?? data['_id'] as String? ?? '',
      name:
          data['business_name'] as String? ??
          data['name'] as String? ??
          'Wholesaler',
      avatarUrl:
          data['avatar_url'] as String? ?? data['avatarUrl'] as String? ?? '',
      coverUrl:
          data['cover_url'] as String? ?? data['coverUrl'] as String? ?? '',
      isVerified: data['isVerified'] as bool? ?? false,
      totalOrders: data['totalOrders']?.toString() ?? '0',
      rating: (data['rating'] as num?)?.toDouble() ?? 0.0,
      totalProducts: data['totalProducts'] as int? ?? 0,
      bio:
          data['business_description'] as String? ??
          data['bio'] as String? ??
          '',
      category: data['category'] as String? ?? '',
    );
  }
}

class VideoPostModel {
  final String id;
  final String videoUrl;
  final String thumbnailUrl;
  final String caption;
  final int likesCount;
  final int commentsCount;

  VideoPostModel({
    required this.id,
    required this.videoUrl,
    required this.thumbnailUrl,
    required this.caption,
    required this.likesCount,
    required this.commentsCount,
  });

  factory VideoPostModel.fromJson(Map<String, dynamic> json) {
    return VideoPostModel(
      id: json['id'] as String? ?? '',
      videoUrl:
          json['videoUrl'] as String? ?? json['video_url'] as String? ?? '',
      thumbnailUrl:
          json['thumbnailUrl'] as String? ??
          ((json['media_urls'] as List<dynamic>?)?.firstOrNull?.toString() ??
              ''),
      caption: json['caption'] as String? ?? '',
      likesCount:
          (json['likesCount'] ?? json['likes_count'] as num?)?.toInt() ?? 0,
      commentsCount: (json['commentsCount'] as num?)?.toInt() ?? 0,
    );
  }
}

class ProductModel {
  final String id;
  final String name;
  final double price;
  final String imageUrl;
  final int minOrderQuantity;

  ProductModel({
    required this.id,
    required this.name,
    required this.price,
    required this.imageUrl,
    required this.minOrderQuantity,
  });

  factory ProductModel.fromJson(Map<String, dynamic> json) {
    final images = json['images'] as List<dynamic>? ?? [];
    final firstImage = images.isNotEmpty
        ? images.first as String
        : (json['imageUrl'] as String? ?? '');

    return ProductModel(
      id: json['id'] as String? ?? json['_id'] as String? ?? '',
      name: json['name'] as String? ?? json['title'] as String? ?? '',
      price: json['price_piasters'] is num
          ? (json['price_piasters'] as num).toDouble() / 100
          : (json['price'] as num?)?.toDouble() ?? 0.0,
      imageUrl: firstImage,
      minOrderQuantity:
          (json['minOrderQuantity'] as num?)?.toInt() ??
          (json['moq'] as num?)?.toInt() ??
          1,
    );
  }
}

class ReviewModel {
  final String id;
  final String buyerName;
  final double rating;
  final String comment;
  final String date;

  ReviewModel({
    required this.id,
    required this.buyerName,
    required this.rating,
    required this.comment,
    required this.date,
  });

  factory ReviewModel.fromJson(Map<String, dynamic> json) {
    return ReviewModel(
      id: json['id'] as String? ?? '',
      buyerName:
          json['buyerName'] as String? ??
          (json['reviewerName'] as String? ?? 'Buyer'),
      rating: (json['rating'] as num?)?.toDouble() ?? 0.0,
      comment: json['comment'] as String? ?? '',
      date: json['date'] as String? ?? '',
    );
  }
}
