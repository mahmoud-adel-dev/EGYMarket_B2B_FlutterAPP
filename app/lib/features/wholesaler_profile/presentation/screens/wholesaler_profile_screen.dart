import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../auth/data/models/auth_models.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
import '../../../auth/presentation/cubit/auth_state.dart';
import '../../../auth/presentation/utils/auth_action_guard.dart';
import '../../../chat/presentation/utils/start_product_inquiry.dart';
import '../../../cart/data/models/cart_item_model.dart';
import '../../../cart/data/services/local_cart_service.dart';
import '../../../cart/presentation/screens/local_cart_screen.dart';
import '../../data/models/wholesaler_profile_models.dart';
import '../cubit/wholesaler_profile_cubit.dart';
import '../cubit/wholesaler_profile_state.dart';
import '../widgets/product_card_widget.dart';
import '../widgets/profile_header_widget.dart';
import '../widgets/sliver_tab_bar_delegate.dart';
import '../widgets/video_post_widget.dart';

/// Main Wholesaler Social-Style Profile Screen.
///
/// Features:
/// - Custom `SliverAppBar` with Cover, Avatar, Verified Badge, & B2B Metrics.
/// - Pinned `SliverPersistentHeader` with 3 tabs ("Feed", "Products", "Reviews").
/// - High-performance video feed with lazy loading & off-screen memory disposal.
/// - High-performance product grid powered by `CachedNetworkImage` & Shimmer.
class WholesalerProfileScreen extends StatelessWidget {
  final String wholesalerId;

  const WholesalerProfileScreen({super.key, required this.wholesalerId});

  @override
  Widget build(BuildContext context) {
    // Note: dependency injection via ServiceLocator; the cubit receives the
    // process-wide network manager.
    final networkManager = ServiceLocator.network();

    return BlocProvider(
      create: (context) =>
          WholesalerProfileCubit(networkManager: networkManager)
            ..fetchWholesalerProfile(wholesalerId),
      child: _WholesalerProfileView(wholesalerId: wholesalerId),
    );
  }
}

class _WholesalerProfileView extends StatefulWidget {
  final String wholesalerId;

  const _WholesalerProfileView({required this.wholesalerId});

  @override
  State<_WholesalerProfileView> createState() => _WholesalerProfileViewState();
}

class _WholesalerProfileViewState extends State<_WholesalerProfileView>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _submitRating() async {
    final buyer = await requireBuyer(context, actionLabel: tr('review_rate_merchant'));
    if (buyer == null || !mounted) return;

    try {
      final response = await ServiceLocator.network().get<Map<String, dynamic>>(
        '/ratings',
        queryParameters: {
          'target_type': 'wholesaler',
          'target_id': widget.wholesalerId,
          'limit': 1,
        },
        requiresAuth: false,
      );
      final eligibility = response['eligibility'] as Map?;
      if (eligibility?['can_rate'] != true) {
        if (!mounted) return;
        ErrorHandler.showSecureSnackBar(
          context,
          tr('review_eligibility_error'),
          isError: true,
        );
        return;
      }
    } catch (error) {
      if (mounted) {
        ErrorHandler.showSecureSnackBar(
          context,
          ErrorHandler.getUserFriendlyMessage(error),
          isError: true,
        );
      }
      return;
    }
    if (!mounted) return;

    final reviewController = TextEditingController();
    var stars = 5;
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(tr('review_rate_merchant')),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  5,
                  (index) => IconButton(
                    onPressed: () => setDialogState(() => stars = index + 1),
                    icon: Icon(
                      index < stars
                          ? Icons.star_rounded
                          : Icons.star_border_rounded,
                      color: Colors.amber,
                    ),
                  ),
                ),
              ),
              TextField(
                controller: reviewController,
                minLines: 3,
                maxLines: 5,
                maxLength: 1000,
                decoration: InputDecoration(
                  labelText: tr('review_experience_label'),
                  alignLabelWithHint: true,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                tr('review_credibility_note'),
                style: const TextStyle(fontSize: 12, color: Colors.grey),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: Text(tr('cancel')),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, {
                'rating': stars,
                'review': reviewController.text.trim(),
              }),
              child: Text(tr('review_save')),
            ),
          ],
        ),
      ),
    );
    reviewController.dispose();
    if (result == null || !mounted) return;

    try {
      final network = ServiceLocator.network();
      await network.post<Map<String, dynamic>>(
        '/ratings',
        data: {
          'target_type': 'wholesaler',
          'target_id': widget.wholesalerId,
          ...result,
        },
      );
      if (!mounted) return;
      ErrorHandler.showSecureSnackBar(
        context,
        tr('review_saved'),
        isError: false,
      );
      await context.read<WholesalerProfileCubit>().fetchWholesalerProfile(
        widget.wholesalerId,
      );
    } catch (error) {
      if (mounted) {
        ErrorHandler.showSecureSnackBar(
          context,
          ErrorHandler.getUserFriendlyMessage(error),
          isError: true,
        );
      }
    }
  }

  Future<void> _addProductToCart(ProductModel product) async {
    try {
      final network = ServiceLocator.network();
      final response = await network.get<Map<String, dynamic>>(
        '/products/${product.id}',
        requiresAuth: false,
      );
      final cartItem = CartItemModel.fromProductJson(
        Map<String, dynamic>.from(response['product'] as Map),
      );
      await LocalCartService().add(cartItem);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(tr('product_added_local_cart')),
          action: SnackBarAction(
            label: tr('cart'),
            onPressed: () => Navigator.of(
              context,
            ).push(MaterialPageRoute(builder: (_) => const LocalCartScreen())),
          ),
        ),
      );
    } catch (error) {
      if (mounted) {
        ErrorHandler.showSecureSnackBar(
          context,
          ErrorHandler.getUserFriendlyMessage(error),
          isError: true,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: BlocBuilder<WholesalerProfileCubit, WholesalerProfileState>(
        builder: (context, state) {
          if (state is WholesalerProfileLoading) {
            return const Center(child: CircularProgressIndicator());
          }

          if (state is WholesalerProfileError) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.error_outline,
                    size: 48,
                    color: Colors.redAccent,
                  ),
                  const SizedBox(height: 12),
                  Text(state.message, textAlign: TextAlign.center),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () {
                      context
                          .read<WholesalerProfileCubit>()
                          .fetchWholesalerProfile(widget.wholesalerId);
                    },
                    child: Text(tr('retry')),
                  ),
                ],
              ),
            );
          }

          if (state is WholesalerProfileLoaded) {
            final authState = context.watch<AuthCubit>().state;
            final showRatingAction =
                authState is! AuthenticatedState ||
                authState.user.role == UserRole.retailer;
            return DefaultTabController(
              length: 3,
              child: NestedScrollView(
                headerSliverBuilder: (context, innerBoxIsScrolled) {
                  return [
                    // 1. Custom Sliver Header (Profile, Cover, Stats)
                    SliverToBoxAdapter(
                      child: ProfileHeaderWidget(profile: state.profile),
                    ),

                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                        child: Row(
                          children: [
                            if (showRatingAction) ...[
                              Expanded(
                                child: FilledButton.icon(
                                  onPressed: _submitRating,
                                  icon: const Icon(Icons.star_rounded),
                                  label: Text(tr('review_rate_merchant')),
                                ),
                              ),
                              const SizedBox(width: 10),
                            ],
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: () => _tabController.animateTo(1),
                                icon: const Icon(
                                  Icons.question_answer_outlined,
                                ),
                                label: Text(tr('choose_product_inquiry')),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SliverToBoxAdapter(child: SizedBox(height: 12)),

                    // 2. Pinned TabBar (Feed, Products, Reviews)
                    SliverPersistentHeader(
                      pinned: true,
                      delegate: SliverTabBarDelegate(
                        tabBar: TabBar(
                          controller: _tabController,
                          labelColor: Colors.blueAccent,
                          unselectedLabelColor: Colors.grey[600],
                          indicatorColor: Colors.blueAccent,
                          indicatorWeight: 3,
                          tabs: [
                            Tab(text: tr('tab_feed_videos')),
                            Tab(text: tr('products_tab')),
                            Tab(text: tr('reviews_tab')),
                          ],
                        ),
                        backgroundColor: Theme.of(
                          context,
                        ).scaffoldBackgroundColor,
                      ),
                    ),
                  ];
                },
                body: TabBarView(
                  controller: _tabController,
                  children: [
                    // TAB 1: Feed (Videos / Posts)
                    _buildFeedTab(state),

                    // TAB 2: Products (Grid)
                    _buildProductsTab(state),

                    // TAB 3: Reviews List
                    _buildReviewsTab(state),
                  ],
                ),
              ),
            );
          }

          return const SizedBox.shrink();
        },
      ),
    );
  }

  /// Tab 1: Video Feed with Memory Management
  Widget _buildFeedTab(WholesalerProfileLoaded state) {
    if (state.videoPosts.isEmpty) {
      return Center(child: Text(tr('empty_feed_videos')));
    }

    return ListView.builder(
      padding: const EdgeInsets.only(top: 8, bottom: 24),
      itemCount: state.videoPosts.length,
      itemBuilder: (context, index) {
        final post = state.videoPosts[index];
        return VideoPostWidget(post: post);
      },
    );
  }

  /// Tab 2: Products Sliver Grid with Cached Images
  Widget _buildProductsTab(WholesalerProfileLoaded state) {
    if (state.products.isEmpty) {
      return Center(child: Text(tr('empty_products_listed')));
    }

    return GridView.builder(
      padding: const EdgeInsets.all(12),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        childAspectRatio: 0.52,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
      ),
      itemCount: state.products.length,
      itemBuilder: (context, index) {
        final product = state.products[index];
        return ProductCardWidget(
          product: product,
          onInquiry: () => startProductInquiry(
            context,
            productId: product.id,
            productName: product.name,
          ),
          onAddToCart: () => _addProductToCart(product),
        );
      },
    );
  }

  /// Tab 3: Reviews List
  Widget _buildReviewsTab(WholesalerProfileLoaded state) {
    if (state.reviews.isEmpty) {
      return Center(child: Text(tr('no_reviews')));
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: state.reviews.length,
      separatorBuilder: (context, index) => const Divider(),
      itemBuilder: (context, index) {
        final review = state.reviews[index];
        return ListTile(
          leading: CircleAvatar(
            backgroundColor: Colors.blue[100],
            child: Text(
              review.buyerName[0].toUpperCase(),
              style: const TextStyle(
                fontWeight: FontWeight.bold,
                color: Colors.blueAccent,
              ),
            ),
          ),
          title: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                review.buyerName,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                ),
              ),
              Text(
                review.date,
                style: TextStyle(fontSize: 12, color: Colors.grey[500]),
              ),
            ],
          ),
          subtitle: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 4),
              Row(
                children: List.generate(
                  5,
                  (starIndex) => Icon(
                    starIndex < review.rating ? Icons.star : Icons.star_border,
                    size: 16,
                    color: Colors.amber,
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                review.comment,
                style: TextStyle(color: Colors.grey[800], fontSize: 13),
              ),
            ],
          ),
        );
      },
    );
  }
}
