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
        'اختر منتجًا منشورًا أولًا حتى يصل العرض إلى الكتالوج والسلة',
        isError: true,
      );
      return;
    }
    if (_caption.text.trim().isEmpty || _files.isEmpty) {
      ErrorHandler.showSecureSnackBar(
        context,
        'أدخل وصفًا واختر صورة أو فيديو',
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
        'تم نشر العرض وربطه بالمنتج. سيظهر في الصفحة الرئيسية ويمكن فتحه وإضافته للسلة.',
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
      appBar: AppBar(title: const Text('نشر عرض جملة')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Card(
            color: Theme.of(context).colorScheme.primaryContainer,
            child: const Padding(
              padding: EdgeInsets.all(14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'المنتج هو سجل المخزون والسعر ويظهر في الكتالوج. هذا العرض منشور تسويقي مرتبط بالمنتج ويظهر في الصفحة الرئيسية.',
                    ),
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
                    const Text(
                      'لا يوجد منتج منشور يمكن ربطه بالعرض. أنشئ المنتج أولًا، وأكمل توثيق المتجر إذا حُفظ كمسودة.',
                    ),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: _createProduct,
                      icon: const Icon(Icons.add_box_outlined),
                      label: const Text('إنشاء منتج الآن'),
                    ),
                  ],
                ),
              ),
            )
          else ...[
            DropdownButtonFormField<String>(
              initialValue: _selectedProductId,
              decoration: const InputDecoration(
                labelText: 'المنتج المرتبط بالعرض',
                prefixIcon: Icon(Icons.inventory_2_outlined),
              ),
              items: _products
                  .map(
                    (product) => DropdownMenuItem<String>(
                      value: product['_id']?.toString(),
                      child: Text(
                        product['title']?.toString() ?? 'منتج',
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
                label: const Text('إضافة منتج آخر'),
              ),
            ),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: _caption,
            maxLines: 5,
            maxLength: 2000,
            decoration: const InputDecoration(labelText: 'وصف العرض'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _category,
            decoration: const InputDecoration(labelText: 'الفئة'),
            items: categories
                .map(
                  (value) => DropdownMenuItem(value: value, child: Text(value)),
                )
                .toList(),
            onChanged: (value) =>
                setState(() => _category = value ?? 'General'),
          ),
          const SizedBox(height: 12),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(
                value: 'image',
                label: Text('صور'),
                icon: Icon(Icons.image),
              ),
              ButtonSegment(
                value: 'video',
                label: Text('فيديو'),
                icon: Icon(Icons.videocam),
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
                  ? 'اختر من الهاتف'
                  : 'تم اختيار ${_files.length} ملف',
            ),
          ),
          const SizedBox(height: 20),
          SizedBox(
            height: 52,
            child: ElevatedButton(
              onPressed: _submitting ? null : _publish,
              child: _submitting
                  ? const CircularProgressIndicator(color: Colors.white)
                  : const Text('نشر'),
            ),
          ),
        ],
      ),
    );
  }
}
