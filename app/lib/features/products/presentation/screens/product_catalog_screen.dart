import 'dart:async';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/di/service_locator.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../../core/network/network_manager.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../cart/data/models/cart_item_model.dart';
import '../../../cart/data/services/local_cart_service.dart';
import '../../../cart/presentation/screens/local_cart_screen.dart';
import '../../../auth/presentation/utils/auth_action_guard.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
import '../../../auth/presentation/cubit/auth_state.dart';
import '../../../auth/data/models/auth_models.dart';
import '../../../chat/presentation/utils/start_product_inquiry.dart';

class ProductCatalogScreen extends StatefulWidget {
  final String? initialProductId;

  const ProductCatalogScreen({super.key, this.initialProductId});
  @override
  State<ProductCatalogScreen> createState() => _ProductCatalogScreenState();
}

class _ProductCatalogScreenState extends State<ProductCatalogScreen> {
  late final INetworkManager _network;
  final _search = TextEditingController();
  final _scrollController = ScrollController();
  final _localCart = LocalCartService();
  Timer? _debounce;
  List<CartItemModel> _products = const [];
  List<Map<String, dynamic>> _recommendedWholesalers = const [];
  List<Map<String, dynamic>> _categories = const [];
  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = true;
  int _page = 1;
  String? _error;
  String? _category;
  String? _saleType;
  String _sort = 'relevance';
  double? _minPrice;
  double? _maxPrice;

  @override
  void initState() {
    super.initState();
    _network = ServiceLocator.network();
    _loadProducts();
    if (widget.initialProductId?.isNotEmpty == true) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _openInitialProduct(widget.initialProductId!);
      });
    }
    final authState = context.read<AuthCubit>().state;
    if (authState is AuthenticatedState &&
        authState.user.role == UserRole.retailer) {
      _loadRecommendations();
    }
    _scrollController.addListener(() {
      if (_scrollController.position.extentAfter < 500) {
        _loadProducts(refresh: false);
      }
    });
  }

  Future<void> _openInitialProduct(String productId) async {
    try {
      final response = await _network.get<Map<String, dynamic>>(
        '/products/$productId',
        requiresAuth: false,
      );
      if (!mounted) return;
      final details = Map<String, dynamic>.from(response['product'] as Map);
      final product = CartItemModel.fromProductJson(details);
      await _showProductDetails(product, prefetchedDetails: details);
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

  Future<void> _loadProducts({bool refresh = true}) async {
    if (refresh) {
      if (_loadingMore) return;
      _page = 1;
      _hasMore = true;
      setState(() {
        _loading = true;
        _error = null;
      });
    } else {
      if (_loading || _loadingMore || !_hasMore) return;
      setState(() => _loadingMore = true);
    }
    try {
      final response = await _network.get<Map<String, dynamic>>(
        '/products',
        queryParameters: {
          'q': _search.text.trim(),
          'page': _page,
          'limit': 10,
          if (_category != null) 'category': _category,
          if (_saleType != null) 'sale_type': _saleType,
          if (_minPrice != null) 'min_price': _minPrice,
          if (_maxPrice != null) 'max_price': _maxPrice,
          'sort': _sort,
        },
        requiresAuth: false,
      );
      final rows = response['products'] as List<dynamic>? ?? const [];
      final facets = response['facets'] as Map<String, dynamic>? ?? const {};
      final pagination =
          response['pagination'] as Map<String, dynamic>? ?? const {};
      if (!mounted) return;
      setState(() {
        final pageProducts = rows
            .map(
              (row) =>
                  CartItemModel.fromProductJson(row as Map<String, dynamic>),
            )
            .toList();
        _products = refresh ? pageProducts : [..._products, ...pageProducts];
        final currentPage = (pagination['page'] as num?)?.toInt() ?? _page;
        final totalPages =
            (pagination['total_pages'] as num?)?.toInt() ?? currentPage;
        _hasMore = currentPage < totalPages;
        if (_hasMore) _page = currentPage + 1;
        _categories = (facets['categories'] as List<dynamic>? ?? const [])
            .map((item) => Map<String, dynamic>.from(item as Map))
            .toList();
      });
    } catch (error) {
      if (mounted) {
        setState(() => _error = ErrorHandler.getUserFriendlyMessage(error));
      }
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadingMore = false;
        });
      }
    }
  }

  Future<void> _loadRecommendations() async {
    try {
      final response = await _network.get<Map<String, dynamic>>(
        '/recommendations',
      );
      if (!mounted) return;
      setState(() {
        _recommendedWholesalers =
            (response['wholesalers'] as List<dynamic>? ?? const [])
                .map((item) => Map<String, dynamic>.from(item as Map))
                .toList();
      });
    } catch (_) {
      // Recommendations are available to signed-in buyers only.
    }
  }

  Future<void> _followWholesaler(String organizationId) async {
    final buyer = await requireBuyer(
      context,
      actionLabel: tr('catalog_follow_supplier'),
    );
    if (buyer == null || !mounted) return;
    try {
      await _network.post<Map<String, dynamic>>(
        '/follows',
        data: {'wholesaler_organization_id': organizationId},
      );
      if (!mounted) return;
      setState(
        () => _recommendedWholesalers = _recommendedWholesalers
            .where((item) => item['id']?.toString() != organizationId)
            .toList(),
      );
      ErrorHandler.showSecureSnackBar(
        context,
        tr('catalog_followed_supplier'),
        isError: false,
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

  Future<void> _showFilters() async {
    final minController = TextEditingController(
      text: _minPrice?.toString() ?? '',
    );
    final maxController = TextEditingController(
      text: _maxPrice?.toString() ?? '',
    );
    String? selectedSaleType = _saleType;
    String selectedSort = _sort;
    final apply = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            20,
            20,
            MediaQuery.viewInsetsOf(context).bottom + 24,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                tr('catalog_smart_filter'),
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String?>(
                initialValue: selectedSaleType,
                decoration: InputDecoration(labelText: tr('catalog_sale_type')),
                items: [
                  DropdownMenuItem<String?>(
                    value: null,
                    child: Text(tr('catalog_all_sale_types')),
                  ),
                  DropdownMenuItem(
                    value: 'piece',
                    child: Text(tr('sale_type_piece')),
                  ),
                  DropdownMenuItem(
                    value: 'pack',
                    child: Text(tr('sale_type_pack')),
                  ),
                  DropdownMenuItem(
                    value: 'carton',
                    child: Text(tr('sale_type_carton')),
                  ),
                  DropdownMenuItem(
                    value: 'pallet',
                    child: Text(tr('sale_type_pallet')),
                  ),
                ],
                onChanged: (value) =>
                    setSheetState(() => selectedSaleType = value),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: selectedSort,
                decoration: InputDecoration(labelText: tr('sort')),
                items: [
                  DropdownMenuItem(
                    value: 'relevance',
                    child: Text(tr('sort_relevance')),
                  ),
                  DropdownMenuItem(
                    value: 'newest',
                    child: Text(tr('sort_newest')),
                  ),
                  DropdownMenuItem(
                    value: 'price_asc',
                    child: Text(tr('sort_price_asc')),
                  ),
                  DropdownMenuItem(
                    value: 'price_desc',
                    child: Text(tr('sort_price_desc')),
                  ),
                  DropdownMenuItem(
                    value: 'stock_desc',
                    child: Text(tr('sort_stock_desc')),
                  ),
                ],
                onChanged: (value) =>
                    setSheetState(() => selectedSort = value ?? 'relevance'),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: minController,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: InputDecoration(
                        labelText: tr('catalog_min_price'),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: maxController,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: InputDecoration(
                        labelText: tr('catalog_max_price'),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: Text(tr('apply')),
              ),
            ],
          ),
        ),
      ),
    );
    if (apply == true && mounted) {
      setState(() {
        _saleType = selectedSaleType;
        _sort = selectedSort;
        _minPrice = double.tryParse(minController.text.trim());
        _maxPrice = double.tryParse(maxController.text.trim());
      });
      await _loadProducts();
    }
    minController.dispose();
    maxController.dispose();
  }

  Future<void> _showProductDetails(
    CartItemModel product, {
    Map<String, dynamic>? prefetchedDetails,
  }) async {
    try {
      final response = prefetchedDetails == null
          ? await _network.get<Map<String, dynamic>>(
              '/products/${product.productId}',
              requiresAuth: false,
            )
          : <String, dynamic>{'product': prefetchedDetails};
      if (!mounted) return;
      final details = Map<String, dynamic>.from(response['product'] as Map);
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (context) => _ProductDetailsSheet(
          details: details,
          product: product,
          onAdd: () {
            Navigator.pop(context);
            _addToCart(product);
          },
          onInquiry: () {
            Navigator.pop(context);
            startProductInquiry(
              this.context,
              productId: product.productId,
              productName: product.productName,
            );
          },
          onPurchase: () {
            Navigator.pop(context);
            _purchaseProduct(product);
          },
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

  Future<bool> _addToCart(CartItemModel product) async {
    try {
      await _localCart.add(product);
      if (!mounted) return false;
      ErrorHandler.showSecureSnackBar(
        context,
        tr(
          'added_to_cart',
          namedArgs: {
            'qty': '${product.minOrderQuantity}',
            'name': product.productName,
          },
        ),
        isError: false,
      );
      return true;
    } catch (error) {
      if (mounted) {
        ErrorHandler.showSecureSnackBar(
          context,
          ErrorHandler.getUserFriendlyMessage(error),
          isError: true,
        );
      }
      return false;
    }
  }

  Future<void> _purchaseProduct(CartItemModel product) async {
    final added = await _addToCart(product);
    if (!added || !mounted) return;
    await Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const LocalCartScreen()));
  }

  Future<void> _openCart() async {
    await Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const LocalCartScreen()));
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDesktop = MediaQuery.sizeOf(context).width >= 1024;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: isDesktop
          ? null
          : AppBar(
              title: Text(tr('wholesale_catalog')),
              actions: [
                IconButton(
                  icon: const Icon(Icons.shopping_cart_outlined),
                  onPressed: _openCart,
                ),
              ],
            ),
      body: RefreshIndicator(
        onRefresh: _loadProducts,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              margin: EdgeInsets.fromLTRB(
                isDesktop ? 6 : 16,
                6,
                isDesktop ? 6 : 16,
                16,
              ),
              padding: EdgeInsets.all(isDesktop ? 22 : 16),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final horizontal = constraints.maxWidth >= 720;
                  final heading = Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        tr('catalog_trusted_heading'),
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        tr('catalog_compare_subtitle'),
                        style: Theme.of(
                          context,
                        ).textTheme.bodySmall?.copyWith(color: AppColors.muted),
                      ),
                    ],
                  );
                  final search = SizedBox(
                    width: horizontal ? 390 : double.infinity,
                    child: TextField(
                      controller: _search,
                      decoration: InputDecoration(
                        hintText: tr('catalog_search_hint'),
                        prefixIcon: const Icon(Icons.search_rounded),
                        suffixIcon: _search.text.isEmpty
                            ? IconButton(
                                onPressed: _showFilters,
                                icon: const Icon(Icons.tune_rounded),
                              )
                            : IconButton(
                                onPressed: () {
                                  _search.clear();
                                  _loadProducts();
                                },
                                icon: const Icon(Icons.close_rounded),
                              ),
                      ),
                      onChanged: (_) {
                        setState(() {});
                        _debounce?.cancel();
                        _debounce = Timer(
                          const Duration(milliseconds: 400),
                          _loadProducts,
                        );
                      },
                    ),
                  );
                  if (!horizontal) {
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [heading, const SizedBox(height: 16), search],
                    );
                  }
                  return Row(
                    children: [
                      Expanded(child: heading),
                      const SizedBox(width: 24),
                      search,
                    ],
                  );
                },
              ),
            ),
            if (_categories.isNotEmpty)
              SizedBox(
                height: 48,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: EdgeInsets.symmetric(horizontal: isDesktop ? 6 : 16),
                  children: [
                    Padding(
                      padding: const EdgeInsetsDirectional.only(end: 8),
                      child: ChoiceChip(
                        label: Text(tr('all')),
                        selected: _category == null,
                        onSelected: (_) {
                          setState(() => _category = null);
                          _loadProducts();
                        },
                      ),
                    ),
                    ..._categories.map(
                      (item) => Padding(
                        padding: const EdgeInsetsDirectional.only(end: 8),
                        child: ChoiceChip(
                          label: Text('${item['name']} (${item['count']})'),
                          selected: _category == item['name'],
                          onSelected: (_) {
                            setState(
                              () => _category = item['name']?.toString(),
                            );
                            _loadProducts();
                          },
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            if (_recommendedWholesalers.isNotEmpty) ...[
              Padding(
                padding: EdgeInsets.fromLTRB(
                  isDesktop ? 6 : 16,
                  4,
                  isDesktop ? 6 : 16,
                  8,
                ),
                child: Text(
                  tr('catalog_recommended_suppliers'),
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              SizedBox(
                height: 94,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: EdgeInsets.symmetric(horizontal: isDesktop ? 6 : 16),
                  itemCount: _recommendedWholesalers.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 10),
                  itemBuilder: (context, index) {
                    final supplier = _recommendedWholesalers[index];
                    return Container(
                      width: 230,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        border: Border.all(color: AppColors.border),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(
                        children: [
                          CircleAvatar(
                            child: Text(
                              (supplier['business_name']?.toString() ?? '?')[0],
                            ),
                          ),
                          const SizedBox(width: 9),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(
                                  supplier['business_name']?.toString() ?? '',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                Text(
                                  tr(
                                    'catalog_matching_products',
                                    namedArgs: {
                                      'count':
                                          supplier['matching_products'] ?? 0,
                                    },
                                  ),
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: AppColors.muted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          IconButton(
                            tooltip: tr('catalog_follow'),
                            onPressed: () =>
                                _followWholesaler(supplier['id'].toString()),
                            icon: const Icon(
                              Icons.person_add_alt_1_rounded,
                              color: AppColors.primary,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ],
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null
                  ? ListView(
                      children: [
                        const SizedBox(height: 120),
                        Center(
                          child: Text(_error!, textAlign: TextAlign.center),
                        ),
                      ],
                    )
                  : _products.isEmpty
                  ? ListView(
                      children: [
                        const SizedBox(height: 100),
                        const _CatalogEmptyState(),
                      ],
                    )
                  : GridView.builder(
                      controller: _scrollController,
                      padding: EdgeInsets.fromLTRB(
                        isDesktop ? 6 : 16,
                        0,
                        isDesktop ? 6 : 16,
                        110,
                      ),
                      gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(
                        maxCrossAxisExtent: 320,
                        childAspectRatio: isDesktop ? .73 : .64,
                        crossAxisSpacing: 16,
                        mainAxisSpacing: 16,
                      ),
                      itemCount: _products.length + (_hasMore ? 1 : 0),
                      itemBuilder: (context, index) {
                        if (index == _products.length) {
                          return const Center(
                            child: CircularProgressIndicator(strokeWidth: 2),
                          );
                        }
                        final product = _products[index];
                        return _CatalogProductCard(
                          product: product,
                          onAdd: () => _addToCart(product),
                          onTap: () => _showProductDetails(product),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CatalogProductCard extends StatelessWidget {
  final CartItemModel product;
  final VoidCallback onAdd;
  final VoidCallback onTap;

  const _CatalogProductCard({
    required this.product,
    required this.onAdd,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  _CatalogCardMedia(product: product),
                  PositionedDirectional(
                    top: 10,
                    start: 10,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 9,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.navy.withValues(alpha: 0.88),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        tr(
                          'catalog_moq_badge',
                          namedArgs: {'qty': '${product.minOrderQuantity}'},
                        ),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.productName,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      height: 1.35,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          tr(
                            'price',
                            namedArgs: {
                              'price': product.unitPrice.toStringAsFixed(2),
                            },
                          ),
                          style: Theme.of(context).textTheme.titleMedium
                              ?.copyWith(
                                color: AppColors.primary,
                                fontWeight: FontWeight.w900,
                              ),
                        ),
                      ),
                      Text(
                        tr('unit_per'),
                        style: Theme.of(
                          context,
                        ).textTheme.bodySmall?.copyWith(color: AppColors.muted),
                      ),
                    ],
                  ),
                  if (product.sellerName.isNotEmpty) ...[
                    const SizedBox(height: 9),
                    Row(
                      children: [
                        const Icon(
                          Icons.verified_rounded,
                          size: 16,
                          color: AppColors.primary,
                        ),
                        const SizedBox(width: 5),
                        Expanded(
                          child: Text(
                            product.sellerName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(color: AppColors.muted),
                          ),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: onAdd,
                      icon: const Icon(
                        Icons.add_shopping_cart_rounded,
                        size: 18,
                      ),
                      label: Text(tr('add_cart')),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CatalogCardMedia extends StatefulWidget {
  final CartItemModel product;
  const _CatalogCardMedia({required this.product});

  @override
  State<_CatalogCardMedia> createState() => _CatalogCardMediaState();
}

class _CatalogCardMediaState extends State<_CatalogCardMedia> {
  int _page = 0;

  @override
  Widget build(BuildContext context) {
    final images =
        widget.product.productImageUrls.isEmpty &&
            widget.product.productImageUrl.isNotEmpty
        ? [widget.product.productImageUrl]
        : widget.product.productImageUrls;
    final media = <Map<String, dynamic>>[
      ...images.map((url) => {'url': url, 'video': false}),
      ...widget.product.productVideoUrls.map(
        (url) => {'url': url, 'video': true},
      ),
    ];
    if (media.isEmpty) {
      return const ColoredBox(
        color: Color(0xFFEAF1F3),
        child: Icon(
          Icons.inventory_2_outlined,
          size: 52,
          color: AppColors.muted,
        ),
      );
    }
    return Stack(
      fit: StackFit.expand,
      children: [
        PageView.builder(
          scrollDirection: Axis.horizontal,
          itemCount: media.length,
          onPageChanged: (value) => setState(() => _page = value),
          itemBuilder: (context, index) {
            final item = media[index];
            final url = item['url'] as String;
            return item['video'] == true
                ? GestureDetector(
                    onTap: () => launchUrl(
                      Uri.parse(url),
                      mode: LaunchMode.externalApplication,
                    ),
                    child: const ColoredBox(
                      color: Colors.black87,
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          Icon(
                            Icons.ondemand_video_outlined,
                            color: Colors.white38,
                            size: 62,
                          ),
                          Icon(
                            Icons.play_circle_fill_rounded,
                            color: Colors.white,
                            size: 42,
                          ),
                        ],
                      ),
                    ),
                  )
                : CachedNetworkImage(
                    imageUrl: url,
                    fit: BoxFit.cover,
                    placeholder: (_, _) => const Center(
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                    errorWidget: (_, _, _) => const Icon(
                      Icons.inventory_2_outlined,
                      size: 52,
                      color: AppColors.muted,
                    ),
                  );
          },
        ),
        if (media.length > 1)
          PositionedDirectional(
            end: 9,
            bottom: 9,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
              decoration: BoxDecoration(
                color: Colors.black54,
                borderRadius: BorderRadius.circular(99),
              ),
              child: Text(
                '${_page + 1}/${media.length}',
                style: const TextStyle(color: Colors.white, fontSize: 10),
              ),
            ),
          ),
      ],
    );
  }
}

class _ProductDetailsSheet extends StatelessWidget {
  final Map<String, dynamic> details;
  final CartItemModel product;
  final VoidCallback onAdd;
  final VoidCallback onInquiry;
  final VoidCallback onPurchase;

  const _ProductDetailsSheet({
    required this.details,
    required this.product,
    required this.onAdd,
    required this.onInquiry,
    required this.onPurchase,
  });

  @override
  Widget build(BuildContext context) {
    final specifications = Map<String, dynamic>.from(
      details['specifications'] as Map? ?? const {},
    );
    final faqs = details['faqs'] as List<dynamic>? ?? const [];
    final images = (details['images'] as List<dynamic>? ?? const [])
        .map((value) => value.toString())
        .toList();
    final videos = (details['video_urls'] as List<dynamic>? ?? const [])
        .map((value) => value.toString())
        .toList();
    final tiers = details['price_tiers'] as List<dynamic>? ?? const [];
    final discount = (details['discount_percent'] as num?)?.toDouble() ?? 0;
    final saleType = switch (details['sale_type']) {
      'pack' => tr('sale_type_pack'),
      'carton' => tr('sale_type_carton'),
      'pallet' => tr('sale_type_pallet'),
      _ => tr('sale_type_piece'),
    };
    return FractionallySizedBox(
      heightFactor: .92,
      child: SafeArea(
        child: Column(
          children: [
            Container(
              width: 44,
              height: 4,
              margin: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: Colors.grey[300],
                borderRadius: BorderRadius.circular(99),
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                children: [
                  if (images.isNotEmpty || videos.isNotEmpty)
                    _ProductMediaCarousel(images: images, videos: videos),
                  const SizedBox(height: 18),
                  Text(
                    product.productName,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    details['description']?.toString() ?? '',
                    style: const TextStyle(height: 1.6),
                  ),
                  const SizedBox(height: 14),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _DetailBadge(icon: Icons.sell_outlined, text: saleType),
                      _DetailBadge(
                        icon: Icons.inventory_2_outlined,
                        text: tr(
                          'catalog_moq_badge',
                          namedArgs: {'qty': details['moq'] ?? 1},
                        ),
                      ),
                      _DetailBadge(
                        icon: Icons.layers_outlined,
                        text: tr(
                          'catalog_units_per_sale',
                          namedArgs: {'count': details['units_per_sale'] ?? 1},
                        ),
                      ),
                      _DetailBadge(
                        icon: Icons.schedule_outlined,
                        text: tr(
                          'catalog_lead_time',
                          namedArgs: {'days': details['lead_time_days'] ?? 1},
                        ),
                      ),
                      if (discount > 0)
                        _DetailBadge(
                          icon: Icons.percent_rounded,
                          text: tr(
                            'catalog_discount',
                            namedArgs: {
                              'percent': discount.toStringAsFixed(
                                discount % 1 == 0 ? 0 : 1,
                              ),
                            },
                          ),
                        ),
                    ],
                  ),
                  if (tiers.isNotEmpty) ...[
                    const SizedBox(height: 22),
                    Text(
                      tr('catalog_tier_prices'),
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    ...tiers.map((raw) {
                      final tier = raw as Map;
                      final price =
                          ((tier['unit_price_piasters'] as num?) ?? 0) / 100;
                      return ListTile(
                        dense: true,
                        leading: const Icon(
                          Icons.trending_down_rounded,
                          color: AppColors.primary,
                        ),
                        title: Text(
                          tr(
                            'catalog_tier_from',
                            namedArgs: {'count': tier['min_quantity']},
                          ),
                        ),
                        trailing: Text(
                          tr(
                            'price',
                            namedArgs: {'price': price.toStringAsFixed(2)},
                          ),
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                      );
                    }),
                  ],
                  if (specifications.isNotEmpty) ...[
                    const SizedBox(height: 18),
                    Text(
                      tr('catalog_specifications'),
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    ...specifications.entries.map(
                      (entry) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 5),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                entry.key,
                                style: const TextStyle(color: AppColors.muted),
                              ),
                            ),
                            Expanded(
                              child: Text(
                                entry.value.toString(),
                                textAlign: TextAlign.end,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                  if ((details['return_policy']?.toString() ?? '')
                      .isNotEmpty) ...[
                    const SizedBox(height: 18),
                    Text(
                      tr('catalog_return_policy'),
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(details['return_policy'].toString()),
                  ],
                  if (faqs.isNotEmpty) ...[
                    const SizedBox(height: 18),
                    Text(
                      tr('catalog_faqs'),
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    ...faqs.map((raw) {
                      final faq = raw as Map;
                      return ExpansionTile(
                        tilePadding: EdgeInsets.zero,
                        title: Text(faq['question']?.toString() ?? ''),
                        children: [
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Align(
                              alignment: AlignmentDirectional.centerStart,
                              child: Text(faq['answer']?.toString() ?? ''),
                            ),
                          ),
                        ],
                      );
                    }),
                  ],
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  OutlinedButton.icon(
                    onPressed: onInquiry,
                    icon: const Icon(Icons.question_answer_outlined),
                    label: Text(tr('catalog_inquiry_to_supplier')),
                  ),
                  const SizedBox(height: 8),
                  FilledButton.icon(
                    onPressed: onPurchase,
                    icon: const Icon(Icons.shopping_bag_rounded),
                    label: Text(
                      tr(
                        'catalog_moq_purchase',
                        namedArgs: {'qty': '${product.minOrderQuantity}'},
                      ),
                    ),
                  ),
                  TextButton.icon(
                    onPressed: onAdd,
                    icon: const Icon(Icons.add_shopping_cart_rounded),
                    label: Text(tr('catalog_add_to_cart_continue')),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProductMediaCarousel extends StatefulWidget {
  final List<String> images;
  final List<String> videos;

  const _ProductMediaCarousel({required this.images, required this.videos});

  @override
  State<_ProductMediaCarousel> createState() => _ProductMediaCarouselState();
}

class _ProductMediaCarouselState extends State<_ProductMediaCarousel> {
  int _page = 0;

  @override
  Widget build(BuildContext context) {
    final media = <Map<String, dynamic>>[
      ...widget.images.map((url) => {'url': url, 'video': false}),
      ...widget.videos.map((url) => {'url': url, 'video': true}),
    ];
    return SizedBox(
      height: 250,
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
              return Container(
                margin: const EdgeInsets.symmetric(horizontal: 3),
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  color: isVideo ? Colors.black87 : const Color(0xFFEAF1F3),
                ),
                child: isVideo
                    ? InkWell(
                        onTap: () => launchUrl(
                          Uri.parse(url),
                          mode: LaunchMode.externalApplication,
                        ),
                        child: const Stack(
                          alignment: Alignment.center,
                          children: [
                            Icon(
                              Icons.ondemand_video_rounded,
                              color: Colors.white38,
                              size: 80,
                            ),
                            Icon(
                              Icons.play_circle_fill_rounded,
                              color: Colors.white,
                              size: 54,
                            ),
                          ],
                        ),
                      )
                    : CachedNetworkImage(
                        imageUrl: url,
                        width: double.infinity,
                        fit: BoxFit.cover,
                        errorWidget: (_, _, _) =>
                            const Icon(Icons.broken_image_outlined),
                      ),
              );
            },
          ),
          if (media.length > 1)
            PositionedDirectional(
              bottom: 10,
              end: 12,
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

class _DetailBadge extends StatelessWidget {
  final IconData icon;
  final String text;
  const _DetailBadge({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
    decoration: BoxDecoration(
      color: const Color(0xFFE4F2F0),
      borderRadius: BorderRadius.circular(10),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: AppColors.primary),
        const SizedBox(width: 5),
        Text(
          text,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
        ),
      ],
    ),
  );
}

class _CatalogEmptyState extends StatelessWidget {
  const _CatalogEmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: const BoxDecoration(
              color: Color(0xFFE4F2F0),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.inventory_2_outlined,
              color: AppColors.primary,
              size: 32,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            tr('catalog_no_matching'),
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 5),
          Text(
            tr('catalog_try_another_search'),
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: AppColors.muted),
          ),
        ],
      ),
    );
  }
}
