import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/constants/api_constants.dart';
import '../../../../core/di/service_locator.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../auth/presentation/utils/auth_action_guard.dart';
import '../../../chat/presentation/utils/start_product_inquiry.dart';
import '../../../cart/data/models/cart_item_model.dart';
import '../../../cart/data/services/local_cart_service.dart';
import '../../../cart/presentation/screens/local_cart_screen.dart';
import '../../../wholesaler_profile/presentation/screens/wholesaler_profile_screen.dart';

class SocialFeedPost {
  final String id;
  final String wholesalerId;
  final String wholesalerName;
  final String wholesalerGovernorate;
  final String wholesalerAvatar;
  final String caption;
  final String category;
  final List<String> mediaUrls;
  final String? videoUrl;
  final List<String> videoUrls;
  final String mediaType; // 'video' | 'image'
  final int commentsCount;
  int likesCount;
  bool likedByCurrentUser;
  final String? productId;
  final String createdAt;
  final List<Map<String, dynamic>> comments;

  SocialFeedPost({
    required this.id,
    required this.wholesalerId,
    required this.wholesalerName,
    required this.wholesalerGovernorate,
    required this.wholesalerAvatar,
    required this.caption,
    required this.category,
    required this.mediaUrls,
    this.videoUrl,
    required this.videoUrls,
    required this.mediaType,
    required this.commentsCount,
    required this.likesCount,
    required this.likedByCurrentUser,
    this.productId,
    required this.createdAt,
    required this.comments,
  });

  factory SocialFeedPost.fromJson(Map<String, dynamic> json) {
    return SocialFeedPost(
      id: json['id'] as String? ?? json['_id'] as String? ?? '',
      wholesalerId: json['wholesalerId'] as String? ?? '',
      wholesalerName: json['wholesalerName'] as String? ?? 'Merchant',
      wholesalerGovernorate: json['wholesalerGovernorate'] as String? ?? '',
      wholesalerAvatar: json['wholesalerAvatar'] as String? ?? '',
      caption: json['caption'] as String? ?? '',
      category: json['category'] as String? ?? 'General',
      mediaUrls:
          (json['mediaUrls'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [],
      videoUrl: json['videoUrl'] as String?,
      videoUrls:
          (json['videoUrls'] as List<dynamic>?)
              ?.map((value) => value.toString())
              .toList() ??
          (json['videoUrl'] == null ? const [] : [json['videoUrl'].toString()]),
      mediaType: json['mediaType'] as String? ?? 'image',
      commentsCount: (json['commentsCount'] as num?)?.toInt() ?? 0,
      likesCount: (json['likesCount'] as num?)?.toInt() ?? 0,
      likedByCurrentUser: json['likedByCurrentUser'] == true,
      productId: json['productId']?.toString(),
      createdAt: json['createdAt'] as String? ?? '',
      comments:
          (json['comments'] as List<dynamic>?)
              ?.map((e) => e as Map<String, dynamic>)
              .toList() ??
          [],
    );
  }
}

class SocialFeedScreen extends StatefulWidget {
  final String? initialPostId;

  const SocialFeedScreen({super.key, this.initialPostId});

  @override
  State<SocialFeedScreen> createState() => _SocialFeedScreenState();
}

class _SocialFeedScreenState extends State<SocialFeedScreen> {
  bool _isLoading = false;
  final List<SocialFeedPost> _feedPosts = [];
  List<String> _categories = ['All'];
  String _selectedCategory = 'All';
  final TextEditingController _searchController = TextEditingController();

  int _currentPage = 1;
  bool _hasMore = true;
  bool _loadMoreScheduled = false;
  bool _didResolveInitialPost = false;

  @override
  void initState() {
    super.initState();
    _loadPosts();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadPosts({bool refresh = true}) async {
    if (!mounted || _isLoading) return;
    if (refresh) {
      _currentPage = 1;
      _hasMore = true;
    }
    if (!_hasMore) return;

    setState(() => _isLoading = true);
    try {
      final network = ServiceLocator.network();

      String path = '/posts?page=$_currentPage&limit=10';
      if (widget.initialPostId?.isNotEmpty == true) {
        path += '&post_id=${Uri.encodeComponent(widget.initialPostId!)}';
      }
      if (_selectedCategory != 'All') {
        path += '&category=${Uri.encodeComponent(_selectedCategory)}';
      }
      if (_searchController.text.trim().isNotEmpty) {
        path += '&search=${Uri.encodeComponent(_searchController.text.trim())}';
      }

      final response = await network.get<Map<String, dynamic>>(
        path,
        requiresAuth: false,
      );

      final rawPosts = response['posts'] as List<dynamic>? ?? [];
      final rawCategories = response['categories'] as List<dynamic>? ?? ['All'];

      if (!mounted) return;
      setState(() {
        if (refresh) {
          _feedPosts.clear();
          _categories = rawCategories.map((e) => e.toString()).toList();
        }
        _feedPosts.addAll(
          rawPosts.map(
            (p) => SocialFeedPost.fromJson(p as Map<String, dynamic>),
          ),
        );
        _hasMore = response['pagination']?['hasMore'] ?? false;
        if (_hasMore) _currentPage++;
      });
      _openInitialPostIfNeeded();
    } catch (e) {
      debugPrint('Error loading posts: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _openInitialPostIfNeeded() {
    if (_didResolveInitialPost || widget.initialPostId?.isNotEmpty != true) {
      return;
    }
    _didResolveInitialPost = true;
    final matching = _feedPosts.where(
      (post) => post.id == widget.initialPostId,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (matching.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('هذا المنشور غير متاح أو تم حذفه.')),
        );
        return;
      }
      _openPostDetails(matching.first);
    });
  }

  void _scheduleLoadMore() {
    if (_loadMoreScheduled || _isLoading || !_hasMore) return;
    _loadMoreScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) {
        _loadMoreScheduled = false;
        return;
      }
      try {
        await _loadPosts(refresh: false);
      } finally {
        _loadMoreScheduled = false;
      }
    });
  }

  BuildContext? _resolveActionContext(BuildContext? actionContext) {
    if (actionContext != null) {
      return actionContext.mounted ? actionContext : null;
    }
    if (!mounted) return null;
    return context;
  }

  void _showComments(SocialFeedPost post, [BuildContext? actionContext]) {
    final sheetContext = _resolveActionContext(actionContext);
    if (sheetContext == null) return;
    final commentController = TextEditingController();
    showModalBottomSheet(
      context: sheetContext,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(ctx).viewInsets.bottom,
          top: 16,
          left: 16,
          right: 16,
        ),
        child: SizedBox(
          height: MediaQuery.of(ctx).size.height * 0.6,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                '${post.commentsCount} Comments',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const Divider(),
              Expanded(
                child: post.comments.isEmpty
                    ? const Center(child: Text('No comments yet.'))
                    : ListView.builder(
                        itemCount: post.comments.length,
                        itemBuilder: (c, i) {
                          final comment = post.comments[i];
                          return ListTile(
                            leading: CircleAvatar(
                              backgroundColor: AppColors.primary,
                              backgroundImage:
                                  comment['avatarUrl']?.isNotEmpty == true
                                  ? NetworkImage(comment['avatarUrl'])
                                  : null,
                              child: comment['avatarUrl']?.isNotEmpty != true
                                  ? const Icon(
                                      Icons.person,
                                      color: Colors.white,
                                      size: 18,
                                    )
                                  : null,
                            ),
                            title: Text(
                              comment['buyerName'] ?? 'User',
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            subtitle: Text(comment['text'] ?? ''),
                          );
                        },
                      ),
              ),
              // Local composer input; the submitted comment is persisted by the API.
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: commentController,
                      decoration: InputDecoration(
                        hintText: 'Write a comment...',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(20),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 8,
                        ),
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.send, color: AppColors.primary),
                    onPressed: () async {
                      final comment = commentController.text.trim();
                      if (comment.isEmpty) return;
                      final user = await requireAuthenticatedUser(
                        ctx,
                        actionLabel: 'إضافة تعليق',
                      );
                      if (user == null || !ctx.mounted) return;
                      try {
                        final network = ServiceLocator.network();
                        await network.post<Map<String, dynamic>>(
                          ApiConstants.postComments(post.id),
                          data: {'comment': comment},
                        );
                        if (ctx.mounted) Navigator.of(ctx).pop();
                        await _loadPosts();
                      } catch (error) {
                        if (ctx.mounted) {
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            const SnackBar(
                              content: Text(
                                'سجل الدخول لإضافة تعليق أو حاول مرة أخرى.',
                              ),
                            ),
                          );
                        }
                      }
                    },
                  ),
                ],
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    ).whenComplete(commentController.dispose);
  }

  Future<void> _toggleLike(
    SocialFeedPost post, [
    BuildContext? actionContext,
  ]) async {
    final feedbackContext = _resolveActionContext(actionContext);
    if (feedbackContext == null) return;
    final user = await requireAuthenticatedUser(
      feedbackContext,
      actionLabel: 'الإعجاب بالمنشور',
    );
    if (user == null || !feedbackContext.mounted) return;
    try {
      final network = ServiceLocator.network();
      final response = await network.post<Map<String, dynamic>>(
        '/posts/${post.id}/likes',
      );
      void applyResponse() {
        post.likedByCurrentUser = response['liked'] == true;
        post.likesCount =
            (response['likesCount'] as num?)?.toInt() ?? post.likesCount;
      }

      if (mounted) {
        setState(applyResponse);
      } else {
        applyResponse();
      }
    } catch (error) {
      if (feedbackContext.mounted) {
        ScaffoldMessenger.of(
          feedbackContext,
        ).showSnackBar(SnackBar(content: Text('تعذر تحديث الإعجاب: $error')));
      }
    }
  }

  Future<void> _addLinkedProductToCart(
    SocialFeedPost post, [
    BuildContext? actionContext,
  ]) async {
    if (post.productId?.isNotEmpty != true) return;
    final feedbackContext = _resolveActionContext(actionContext);
    if (feedbackContext == null) return;
    try {
      final network = ServiceLocator.network();
      final response = await network.get<Map<String, dynamic>>(
        '/products/${post.productId}',
        requiresAuth: false,
      );
      final product = CartItemModel.fromProductJson(
        Map<String, dynamic>.from(response['product'] as Map),
      );
      await LocalCartService().add(product);
      if (!feedbackContext.mounted) return;
      ScaffoldMessenger.of(feedbackContext).showSnackBar(
        SnackBar(
          content: Text('تمت إضافة ${product.productName} للسلة المحلية.'),
          action: SnackBarAction(
            label: 'عرض السلة',
            onPressed: () {
              if (!feedbackContext.mounted) return;
              Navigator.of(feedbackContext).push(
                MaterialPageRoute(builder: (_) => const LocalCartScreen()),
              );
            },
          ),
        ),
      );
    } catch (error) {
      if (feedbackContext.mounted) {
        ScaffoldMessenger.of(feedbackContext).showSnackBar(
          SnackBar(content: Text('تعذرت إضافة المنتج للسلة: $error')),
        );
      }
    }
  }

  Future<void> _openPostDetails(SocialFeedPost post) async {
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _SocialPostDetailsScreen(
          post: post,
          onLike: (actionContext) => _toggleLike(post, actionContext),
          onComments: (actionContext) => _showComments(post, actionContext),
          onAddToCart: (actionContext) =>
              _addLinkedProductToCart(post, actionContext),
        ),
      ),
    );
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () => _loadPosts(refresh: true),
        child: CustomScrollView(
          slivers: [
            // Search Bar
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 56, 16, 12),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _searchController,
                        onSubmitted: (_) => _loadPosts(refresh: true),
                        decoration: InputDecoration(
                          hintText: 'Search posts...',
                          prefixIcon: const Icon(
                            Icons.search,
                            color: AppColors.primary,
                          ),
                          filled: true,
                          fillColor: Colors.white,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(24),
                            borderSide: BorderSide.none,
                          ),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 20,
                            vertical: 0,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Categories Chips
            SliverToBoxAdapter(
              child: SizedBox(
                height: 48,
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  itemCount: _categories.length,
                  itemBuilder: (context, i) {
                    final cat = _categories[i];
                    final isSelected = _selectedCategory == cat;
                    return Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilterChip(
                        label: Text(cat),
                        selected: isSelected,
                        onSelected: (val) {
                          setState(() => _selectedCategory = cat);
                          _loadPosts(refresh: true);
                        },
                        selectedColor: AppColors.primary.withValues(
                          alpha: 0.12,
                        ),
                        checkmarkColor: AppColors.primary,
                        labelStyle: TextStyle(
                          color: isSelected
                              ? AppColors.primary
                              : Colors.grey[700],
                          fontWeight: isSelected
                              ? FontWeight.bold
                              : FontWeight.normal,
                        ),
                        backgroundColor: Colors.white,
                        side: BorderSide(
                          color: isSelected
                              ? AppColors.primary
                              : Colors.transparent,
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),

            if (_isLoading && _currentPage == 1)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(32.0),
                  child: Center(
                    child: CircularProgressIndicator(color: AppColors.primary),
                  ),
                ),
              ),

            if (!_isLoading && _feedPosts.isEmpty)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(32.0),
                  child: Center(
                    child: Column(
                      children: [
                        Icon(
                          Icons.inventory_2_outlined,
                          size: 64,
                          color: Colors.grey[300],
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'No posts found',
                          style: TextStyle(
                            color: Colors.grey[500],
                            fontSize: 16,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

            SliverList(
              delegate: SliverChildBuilderDelegate((context, index) {
                if (index == _feedPosts.length) {
                  if (_hasMore) {
                    _scheduleLoadMore();
                    return const Padding(
                      padding: EdgeInsets.all(16.0),
                      child: Center(
                        child: CircularProgressIndicator(
                          color: AppColors.primary,
                        ),
                      ),
                    );
                  }
                  return const SizedBox(height: 80); // padding for nav bar
                }
                return _buildPostCard(_feedPosts[index]);
              }, childCount: _feedPosts.length + 1),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPostCard(SocialFeedPost post) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
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
          // Header
          Material(
            color: Colors.transparent,
            child: ListTile(
              onTap: () => _openPostDetails(post),
              contentPadding: const EdgeInsets.fromLTRB(16, 8, 12, 0),
              leading: CircleAvatar(
                backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                backgroundImage: post.wholesalerAvatar.isNotEmpty
                    ? NetworkImage(post.wholesalerAvatar)
                    : null,
                child: post.wholesalerAvatar.isEmpty
                    ? Text(
                        post.wholesalerName[0].toUpperCase(),
                        style: const TextStyle(
                          color: AppColors.primary,
                          fontWeight: FontWeight.bold,
                        ),
                      )
                    : null,
              ),
              title: Row(
                children: [
                  Expanded(
                    child: Text(
                      post.wholesalerName,
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                        color: AppColors.ink,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (post.category.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.background,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        post.category,
                        style: TextStyle(
                          fontSize: 10,
                          color: Colors.grey[600],
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                ],
              ),
              subtitle: Row(
                children: [
                  const Icon(Icons.location_on, size: 12, color: Colors.grey),
                  const SizedBox(width: 2),
                  Text(
                    post.wholesalerGovernorate.isNotEmpty
                        ? post.wholesalerGovernorate
                        : 'Egypt',
                    style: const TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                  const Text(' • '),
                  Expanded(
                    child: Text(
                      _formatDate(post.createdAt),
                      style: const TextStyle(fontSize: 12, color: Colors.grey),
                      maxLines: 1,
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Caption
          InkWell(
            onTap: () => _openPostDetails(post),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Text(
                post.caption,
                style: const TextStyle(
                  fontSize: 14,
                  color: Color(0xFF334155),
                  height: 1.4,
                ),
              ),
            ),
          ),

          // Media Carousel
          if (post.mediaUrls.isNotEmpty || post.videoUrls.isNotEmpty)
            _PostMediaCarousel(
              post: post,
              onOpenPost: () => _openPostDetails(post),
            ),

          const SizedBox(height: 8),

          // Action Bar
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            child: Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 2,
              children: [
                TextButton.icon(
                  icon: Icon(
                    post.likedByCurrentUser
                        ? Icons.thumb_up_alt_rounded
                        : Icons.thumb_up_alt_outlined,
                    color: post.likedByCurrentUser
                        ? AppColors.primary
                        : Colors.grey,
                    size: 20,
                  ),
                  label: Text('إعجاب ${post.likesCount}'),
                  onPressed: () => _toggleLike(post),
                ),
                TextButton.icon(
                  icon: const Icon(
                    Icons.chat_bubble_outline_rounded,
                    color: Colors.grey,
                    size: 20,
                  ),
                  label: Text(
                    'تعليق ${post.commentsCount}',
                    style: const TextStyle(color: Colors.grey),
                  ),
                  onPressed: () => _showComments(post),
                ),
                TextButton.icon(
                  icon: const Icon(Icons.star_outline_rounded, size: 20),
                  label: const Text('تقييم'),
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => WholesalerProfileScreen(
                        wholesalerId: post.wholesalerId,
                      ),
                    ),
                  ),
                ),
                if (post.productId?.isNotEmpty == true)
                  TextButton.icon(
                    icon: const Icon(Icons.question_answer_outlined, size: 20),
                    label: const Text('استفسار'),
                    onPressed: () => startProductInquiry(
                      context,
                      productId: post.productId!,
                      productName: post.caption,
                    ),
                  ),
                if (post.productId?.isNotEmpty == true)
                  TextButton.icon(
                    icon: const Icon(Icons.add_shopping_cart_rounded, size: 20),
                    label: const Text('أضف للسلة'),
                    onPressed: () => _addLinkedProductToCart(post),
                  ),
                IconButton(
                  icon: const Icon(
                    Icons.share_outlined,
                    color: Colors.grey,
                    size: 20,
                  ),
                  onPressed: () async {
                    final media =
                        post.videoUrl ??
                        (post.mediaUrls.isEmpty ? '' : post.mediaUrls.first);
                    await Clipboard.setData(
                      ClipboardData(text: '${post.caption}\n$media'),
                    );
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('تم نسخ بيانات العرض للمشاركة'),
                        ),
                      );
                    }
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(String dateStr) {
    try {
      final date = DateTime.parse(dateStr);
      final diff = DateTime.now().difference(date);
      if (diff.inDays > 0) return '${diff.inDays}d';
      if (diff.inHours > 0) return '${diff.inHours}h';
      if (diff.inMinutes > 0) return '${diff.inMinutes}m';
      return 'Just now';
    } catch (_) {
      return '';
    }
  }
}

class _PostMediaCarousel extends StatefulWidget {
  final SocialFeedPost post;
  final VoidCallback onOpenPost;
  final bool fullScreen;

  const _PostMediaCarousel({
    required this.post,
    required this.onOpenPost,
    this.fullScreen = false,
  });

  @override
  State<_PostMediaCarousel> createState() => _PostMediaCarouselState();
}

class _PostMediaCarouselState extends State<_PostMediaCarousel> {
  int _page = 0;

  @override
  Widget build(BuildContext context) {
    final media = <Map<String, dynamic>>[
      ...widget.post.mediaUrls.map((url) => {'url': url, 'video': false}),
      ...widget.post.videoUrls.map((url) => {'url': url, 'video': true}),
    ];
    return SizedBox(
      height: widget.fullScreen ? 420 : 250,
      child: Stack(
        children: [
          PageView.builder(
            scrollDirection: Axis.horizontal,
            itemCount: media.length,
            onPageChanged: (value) => setState(() => _page = value),
            itemBuilder: (context, index) {
              final item = media[index];
              final url = item['url'] as String;
              final isVideo = item['video'] == true;
              return GestureDetector(
                onTap: isVideo && widget.fullScreen
                    ? () => launchUrl(
                        Uri.parse(url),
                        mode: LaunchMode.externalApplication,
                      )
                    : widget.onOpenPost,
                child: Container(
                  margin: EdgeInsets.symmetric(
                    horizontal: widget.fullScreen ? 0 : 16,
                  ),
                  clipBehavior: Clip.antiAlias,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(
                      widget.fullScreen ? 0 : 16,
                    ),
                    color: isVideo ? Colors.black87 : AppColors.background,
                  ),
                  child: isVideo
                      ? const Stack(
                          alignment: Alignment.center,
                          children: [
                            Icon(
                              Icons.ondemand_video,
                              color: Colors.white38,
                              size: 86,
                            ),
                            Icon(
                              Icons.play_circle_fill,
                              color: Colors.white,
                              size: 54,
                            ),
                          ],
                        )
                      : Image.network(
                          url,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => const Center(
                            child: Icon(
                              Icons.image_not_supported,
                              color: Colors.grey,
                              size: 48,
                            ),
                          ),
                        ),
                ),
              );
            },
          ),
          if (media.length > 1)
            PositionedDirectional(
              bottom: 10,
              end: widget.fullScreen ? 14 : 28,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text(
                  '${_page + 1}/${media.length}',
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _SocialPostDetailsScreen extends StatefulWidget {
  final SocialFeedPost post;
  final Future<void> Function(BuildContext actionContext) onLike;
  final void Function(BuildContext actionContext) onComments;
  final Future<void> Function(BuildContext actionContext) onAddToCart;

  const _SocialPostDetailsScreen({
    required this.post,
    required this.onLike,
    required this.onComments,
    required this.onAddToCart,
  });

  @override
  State<_SocialPostDetailsScreen> createState() =>
      _SocialPostDetailsScreenState();
}

class _SocialPostDetailsScreenState extends State<_SocialPostDetailsScreen> {
  @override
  Widget build(BuildContext context) {
    final post = widget.post;
    return Scaffold(
      appBar: AppBar(title: const Text('تفاصيل المنشور')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 30),
        children: [
          ListTile(
            leading: CircleAvatar(
              backgroundImage: post.wholesalerAvatar.isEmpty
                  ? null
                  : NetworkImage(post.wholesalerAvatar),
              child: post.wholesalerAvatar.isEmpty
                  ? const Icon(Icons.storefront_outlined)
                  : null,
            ),
            title: Text(
              post.wholesalerName,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            subtitle: Text('${post.wholesalerGovernorate} · ${post.category}'),
            trailing: IconButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) =>
                      WholesalerProfileScreen(wholesalerId: post.wholesalerId),
                ),
              ),
              icon: const Icon(Icons.storefront_rounded),
            ),
          ),
          if (post.mediaUrls.isNotEmpty || post.videoUrls.isNotEmpty)
            _PostMediaCarousel(post: post, fullScreen: true, onOpenPost: () {}),
          Padding(
            padding: const EdgeInsets.all(18),
            child: Text(
              post.caption,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                height: 1.6,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Wrap(
              alignment: WrapAlignment.center,
              children: [
                TextButton.icon(
                  onPressed: () async {
                    await widget.onLike(context);
                    if (mounted) setState(() {});
                  },
                  icon: Icon(
                    post.likedByCurrentUser
                        ? Icons.thumb_up_alt_rounded
                        : Icons.thumb_up_alt_outlined,
                  ),
                  label: Text('إعجاب ${post.likesCount}'),
                ),
                TextButton.icon(
                  onPressed: () => widget.onComments(context),
                  icon: const Icon(Icons.comment_outlined),
                  label: Text('تعليق ${post.commentsCount}'),
                ),
                if (post.productId?.isNotEmpty == true)
                  TextButton.icon(
                    onPressed: () => widget.onAddToCart(context),
                    icon: const Icon(Icons.add_shopping_cart_rounded),
                    label: const Text('أضف للسلة'),
                  ),
                if (post.productId?.isNotEmpty == true)
                  TextButton.icon(
                    onPressed: () => startProductInquiry(
                      context,
                      productId: post.productId!,
                      productName: post.caption,
                    ),
                    icon: const Icon(Icons.question_answer_outlined),
                    label: const Text('استفسار'),
                  ),
              ],
            ),
          ),
          const Divider(height: 28),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: Text(
              'التعليقات',
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
          if (post.comments.isEmpty)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Text('لا توجد تعليقات بعد.'),
            )
          else
            ...post.comments.map(
              (comment) => ListTile(
                leading: const CircleAvatar(child: Icon(Icons.person_outline)),
                title: Text(comment['buyerName']?.toString() ?? 'مستخدم'),
                subtitle: Text(comment['text']?.toString() ?? ''),
              ),
            ),
        ],
      ),
    );
  }
}
