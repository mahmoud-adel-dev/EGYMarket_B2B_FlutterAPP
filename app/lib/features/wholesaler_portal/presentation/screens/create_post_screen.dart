import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/di/service_locator.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../../core/network/network_manager.dart';
import '../../../../core/utils/media_upload_payload.dart';
import '../../../products/presentation/screens/seller_products_screen.dart';

class CreatePostScreen extends StatefulWidget {
  const CreatePostScreen({super.key});
  @override
  State<CreatePostScreen> createState() => _CreatePostScreenState();
}

class _CreatePostScreenState extends State<CreatePostScreen> {
  final _caption = TextEditingController();
  final _picker = ImagePicker();
  late final INetworkManager _network;
  String _category = 'General';
  String _mediaType = 'image';
  List<XFile> _files = const [];
  List<Map<String, dynamic>> _products = const [];
  String? _selectedProductId;
  bool _loadingProducts = true;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _network = ServiceLocator.network();
    _loadProducts();
  }

  Future<void> _loadProducts({bool selectNewest = false}) async {
    if (mounted) setState(() => _loadingProducts = true);
    try {
      final response = await _network.get<Map<String, dynamic>>(
        '/organizations/me/products',
      );
      final products = (response['products'] as List<dynamic>? ?? const [])
          .map((item) => Map<String, dynamic>.from(item as Map))
          .where(
            (product) =>
                product['status']?.toString() == 'active' &&
                product['isActive'] == true,
          )
          .toList();
      if (!mounted) return;
      setState(() {
        _products = products;
        final selectionStillExists = products.any(
          (product) => product['_id']?.toString() == _selectedProductId,
        );
        if (selectNewest && products.isNotEmpty) {
          _selectProduct(products.first);
        } else if (!selectionStillExists) {
          _selectedProductId = null;
        }
      });
    } catch (error) {
      if (mounted) {
        ErrorHandler.showSecureSnackBar(
          context,
          ErrorHandler.getUserFriendlyMessage(error),
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _loadingProducts = false);
    }
  }

  void _selectProduct(Map<String, dynamic> product) {
    _selectedProductId = product['_id']?.toString();
    final category = product['category']?.toString().trim();
    if (category != null && category.isNotEmpty) _category = category;
  }

  String _categoryLabel(String value) {
    switch (value) {
      case 'General':
        return tr('post_category_general');
      case 'Electronics':
        return tr('cat_electronics');
      case 'Fashion':
        return tr('cat_fashion');
      case 'Food & Beverages':
        return tr('cat_food_beverages');
      case 'Home & Living':
        return tr('cat_home_living');
      case 'Medical':
        return tr('cat_medical');
      default:
        return value;
    }
  }

  Future<void> _createProduct() async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const ProductEditorScreen()),
    );
    if (created == true) await _loadProducts(selectNewest: true);
  }

  Future<void> _pickMedia() async {
    if (_mediaType == 'image') {
      final selected = await _picker.pickMultiImage(
        imageQuality: 82,
        maxWidth: 1800,
      );
      setState(() => _files = selected.take(8).toList());
    } else {
      final selected = await _picker.pickMultipleMedia();
      final videos = selected
          .where((file) {
            final name = file.name.toLowerCase();
            return file.mimeType?.startsWith('video/') == true ||
                name.endsWith('.mp4') ||
                name.endsWith('.mov') ||
                name.endsWith('.webm');
          })
          .take(8)
          .toList();
      setState(() => _files = videos);
    }
  }

  Future<String> _upload(XFile file) async {
    final payload = await payloadFromXFile(file, fileType: _mediaType);
    final response = await _network.post<Map<String, dynamic>>(
      '/upload',
      data: payload.toRequestBody(),
    );
    return (response['media'] as Map<String, dynamic>)['url'].toString();
  }

  Future<void> _publish() async {
    if (_selectedProductId == null) {
      ErrorHandler.showSecureSnackBar(
        context,
        tr('post_select_published_error'),
        isError: true,
      );
      return;
    }
    if (_caption.text.trim().isEmpty || _files.isEmpty) {
      ErrorHandler.showSecureSnackBar(
        context,
        tr('post_caption_media_error'),
        isError: true,
      );
      return;
    }
    setState(() => _submitting = true);
    try {
      final urls = <String>[];
      for (final file in _files) {
        urls.add(await _upload(file));
      }
      await _network.post<Map<String, dynamic>>(
        '/posts',
        data: {
          'caption': _caption.text.trim(),
          'category': _category,
          'product_id': _selectedProductId,
          'media_type': _mediaType,
          if (_mediaType == 'image') 'media_urls': urls,
          if (_mediaType == 'video') 'video_urls': urls,
        },
      );
      if (!mounted) return;
      _caption.clear();
      setState(() {
        _files = const [];
        _selectedProductId = null;
      });
      ErrorHandler.showSecureSnackBar(
        context,
        tr('post_published'),
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
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  void dispose() {
    _caption.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final categories = <String>{
      'General',
      'Electronics',
      'Fashion',
      'Food & Beverages',
      'Home & Living',
      'Medical',
      _category,
    }.toList();
    return Scaffold(
      appBar: AppBar(title: Text(tr('post_title'))),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Card(
            color: Theme.of(context).colorScheme.primaryContainer,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.info_outline),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(tr('post_info')),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          if (_loadingProducts)
            const Center(child: CircularProgressIndicator())
          else if (_products.isEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(tr('post_no_published_product')),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: _createProduct,
                      icon: const Icon(Icons.add_box_outlined),
                      label: Text(tr('post_create_product_now')),
                    ),
                  ],
                ),
              ),
            )
          else ...[
            DropdownButtonFormField<String>(
              initialValue: _selectedProductId,
              decoration: InputDecoration(
                labelText: tr('post_select_product'),
                prefixIcon: const Icon(Icons.inventory_2_outlined),
              ),
              items: _products
                  .map(
                    (product) => DropdownMenuItem<String>(
                      value: product['_id']?.toString(),
                      child: Text(
                        product['title']?.toString() ??
                            tr('post_product_fallback'),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  )
                  .toList(),
              onChanged: _submitting
                  ? null
                  : (value) => setState(() {
                      final product = _products.firstWhere(
                        (item) => item['_id']?.toString() == value,
                      );
                      _selectProduct(product);
                    }),
            ),
            Align(
              alignment: AlignmentDirectional.centerEnd,
              child: TextButton.icon(
                onPressed: _submitting ? null : _createProduct,
                icon: const Icon(Icons.add),
                label: Text(tr('post_add_another_product')),
              ),
            ),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: _caption,
            maxLines: 5,
            maxLength: 2000,
            decoration: InputDecoration(labelText: tr('post_caption_label')),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _category,
            decoration: InputDecoration(labelText: tr('post_category_label')),
            items: categories
                .map(
                  (value) =>
                      DropdownMenuItem(value: value, child: Text(_categoryLabel(value))),
                )
                .toList(),
            onChanged: (value) =>
                setState(() => _category = value ?? 'General'),
          ),
          const SizedBox(height: 12),
          SegmentedButton<String>(
            segments: [
              ButtonSegment(
                value: 'image',
                label: Text(tr('post_images')),
                icon: const Icon(Icons.image),
              ),
              ButtonSegment(
                value: 'video',
                label: Text(tr('post_video')),
                icon: const Icon(Icons.videocam),
              ),
            ],
            selected: {_mediaType},
            onSelectionChanged: (value) => setState(() {
              _mediaType = value.first;
              _files = const [];
            }),
          ),
          const SizedBox(height: 14),
          OutlinedButton.icon(
            onPressed: _submitting ? null : _pickMedia,
            icon: const Icon(Icons.upload_file),
            label: Text(
              _files.isEmpty
                  ? tr('post_pick_from_phone')
                  : tr(
                      'post_files_selected',
                      namedArgs: {'count': '${_files.length}'},
                    ),
            ),
          ),
          const SizedBox(height: 20),
          SizedBox(
            height: 52,
            child: ElevatedButton(
              onPressed: _submitting ? null : _publish,
              child: _submitting
                  ? const CircularProgressIndicator(color: Colors.white)
                  : Text(tr('post_publish')),
            ),
          ),
        ],
      ),
    );
  }
}
