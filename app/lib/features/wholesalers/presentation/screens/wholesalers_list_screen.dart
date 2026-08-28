import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/network/network_manager.dart';
import '../../../wholesaler_profile/data/models/wholesaler_profile_models.dart';
import '../../../wholesaler_profile/presentation/screens/wholesaler_profile_screen.dart';

class WholesalersListScreen extends StatefulWidget {
  const WholesalersListScreen({super.key});

  @override
  State<WholesalersListScreen> createState() => _WholesalersListScreenState();
}

class _WholesalersListScreenState extends State<WholesalersListScreen> {
  bool _isLoading = true;
  String? _error;
  List<WholesalerProfileModel> _wholesalers = [];
  final _search = TextEditingController();
  Timer? _debounce;

  late final INetworkManager _networkManager;

  @override
  void initState() {
    super.initState();
    _networkManager = ServiceLocator.network();
    _fetchWholesalers();
  }

  Future<void> _fetchWholesalers() async {
    try {
      setState(() {
        _isLoading = true;
        _error = null;
      });

      final response = await _networkManager.get<Map<String, dynamic>>(
        '/wholesalers',
        queryParameters: {'q': _search.text.trim(), 'limit': 50},
        requiresAuth: false,
      );
      final items = response['wholesalers'] as List<dynamic>? ?? [];

      setState(() {
        _wholesalers = items
            .map((e) => WholesalerProfileModel.fromJson(e))
            .toList();
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('wholesalers')), centerTitle: true),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: TextField(
              controller: _search,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: tr('wholesalers_search_hint'),
                prefixIcon: const Icon(Icons.search_rounded),
              ),
              onChanged: (_) {
                _debounce?.cancel();
                _debounce = Timer(
                  const Duration(milliseconds: 350),
                  () => _fetchWholesalers(),
                );
              },
              onSubmitted: (_) => _fetchWholesalers(),
            ),
          ),
          Expanded(child: _buildBody()),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.redAccent),
            const SizedBox(height: 12),
            Text(_error!, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _fetchWholesalers,
              child: Text(tr('retry')),
            ),
          ],
        ),
      );
    }

    if (_wholesalers.isEmpty) {
      return Center(child: Text(tr('wholesalers_empty')));
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _wholesalers.length,
      itemBuilder: (context, index) {
        final wholesaler = _wholesalers[index];
        return Card(
          margin: const EdgeInsets.only(bottom: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) =>
                      WholesalerProfileScreen(wholesalerId: wholesaler.id),
                ),
              );
            },
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  height: 120,
                  width: double.infinity,
                  child: wholesaler.coverUrl.isEmpty
                      ? Container(color: Colors.grey[200])
                      : CachedNetworkImage(
                          imageUrl: wholesaler.coverUrl,
                          fit: BoxFit.cover,
                          placeholder: (context, url) => Shimmer.fromColors(
                            baseColor: Colors.grey[300]!,
                            highlightColor: Colors.grey[100]!,
                            child: Container(color: Colors.white),
                          ),
                          errorWidget: (context, url, error) =>
                              Container(color: Colors.grey[200]),
                        ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 30,
                        backgroundColor: Colors.grey[200],
                        backgroundImage: wholesaler.avatarUrl.isEmpty
                            ? null
                            : CachedNetworkImageProvider(wholesaler.avatarUrl),
                        child: wholesaler.avatarUrl.isEmpty
                            ? const Icon(Icons.storefront_outlined)
                            : null,
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    wholesaler.name,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 16,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                if (wholesaler.isVerified)
                                  const Icon(
                                    Icons.verified,
                                    color: Colors.blue,
                                    size: 18,
                                  ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              wholesaler.category,
                              style: TextStyle(
                                color: Colors.grey[600],
                                fontSize: 13,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                const Icon(
                                  Icons.star,
                                  color: Colors.amber,
                                  size: 16,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  '${wholesaler.rating}',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(width: 16),
                                const Icon(
                                  Icons.shopping_bag,
                                  color: Colors.blueGrey,
                                  size: 16,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  tr(
                                    'wholesalers_products_count',
                                    namedArgs: {
                                      'count': '${wholesaler.totalProducts}',
                                    },
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
