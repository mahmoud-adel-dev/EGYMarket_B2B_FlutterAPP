import 'package:cached_network_image/cached_network_image.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

import '../../../../core/utils/price_formatter.dart';
import '../../data/models/wholesaler_profile_models.dart';

/// Product Grid Card Widget with high-performance cached image rendering.
class ProductCardWidget extends StatelessWidget {
  final ProductModel product;
  final VoidCallback? onInquiry;
  final VoidCallback? onAddToCart;

  const ProductCardWidget({
    super.key,
    required this.product,
    this.onInquiry,
    this.onAddToCart,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Product Image with CachedNetworkImage & Shimmer
          Expanded(
            child: SizedBox(
              width: double.infinity,
              child: CachedNetworkImage(
                imageUrl: product.imageUrl,
                fit: BoxFit.cover,
                placeholder: (context, url) => Shimmer.fromColors(
                  baseColor: Colors.grey[300]!,
                  highlightColor: Colors.grey[100]!,
                  child: Container(color: Colors.white),
                ),
                errorWidget: (context, url, error) => Container(
                  color: Colors.grey[200],
                  child: const Icon(
                    Icons.inventory_2_outlined,
                    color: Colors.grey,
                    size: 40,
                  ),
                ),
              ),
            ),
          ),

          // Product Details
          Padding(
            padding: const EdgeInsets.all(10.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  // Server prices arrive as piasters; display in EGP (never "$").
                  PriceFormatter.egp(product.price * 100),
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: Colors.blueAccent,
                  ),
                ),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.blue[50],
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    tr(
                      'moq',
                      namedArgs: {'qty': '${product.minOrderQuantity}'},
                    ),
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: Colors.blue[800],
                    ),
                  ),
                ),
                if (onInquiry != null) ...[
                  const SizedBox(height: 7),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: onInquiry,
                      icon: const Icon(
                        Icons.question_answer_outlined,
                        size: 16,
                      ),
                      label: Text(tr('inquire')),
                    ),
                  ),
                ],
                if (onAddToCart != null) ...[
                  const SizedBox(height: 5),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: onAddToCart,
                      icon: const Icon(
                        Icons.add_shopping_cart_rounded,
                        size: 16,
                      ),
                      label: Text(tr('add_cart')),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
