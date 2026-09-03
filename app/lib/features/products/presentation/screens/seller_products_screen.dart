import 'dart:convert';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../../core/network/network_manager.dart';
import '../../../profile/presentation/screens/organization_verification_screen.dart';

class SellerProductsScreen extends StatefulWidget {
  const SellerProductsScreen({super.key});

  @override
  State<SellerProductsScreen> createState() => _SellerProductsScreenState();
}

class _SellerProductsScreenState extends State<SellerProductsScreen> {
  late final INetworkManager _network;
  List<Map<String, dynamic>> _products = const [];
  Map<String, dynamic>? _organization;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _network = ServiceLocator.network();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    try {
      final responses = await Future.wait<Map<String, dynamic>>([
        _network.get<Map<String, dynamic>>('/organizations/me/products'),
        _network.get<Map<String, dynamic>>('/organizations/me'),
      ]);
      final response = responses[0];
      final organizationResponse = responses[1];
      if (!mounted) return;
      setState(() {
        _products = (response['products'] as List<dynamic>? ?? const [])
            .map((item) => Map<String, dynamic>.from(item as Map))
            .toList();
        final organization = organizationResponse['organization'];
        _organization = organization is Map
            ? Map<String, dynamic>.from(organization)
            : null;
        _error = null;
      });
    } catch (error) {
      if (mounted) {
        setState(() => _error = ErrorHandler.getUserFriendlyMessage(error));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openEditor([Map<String, dynamic>? product]) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => ProductEditorScreen(product: product)),
    );
    if (changed == true) await _load();
  }

  Future<void> _archive(Map<String, dynamic> product) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(tr('product_archive_title')),
        content: Text(
          tr('product_archive_confirm', namedArgs: {'title': product['title']}),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(tr('cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(tr('product_archive')),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await _network.delete<Map<String, dynamic>>(
        '/products/${product['_id']}',
      );
      await _load();
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

  Future<void> _openVerification() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(builder: (_) => const OrganizationVerificationScreen()),
    );
    await _load();
  }

  Widget _publicationBanner() {
    final status =
        _organization?['verification_status']?.toString() ?? 'unsubmitted';
    final verified = status == 'verified';
    final pending = status == 'pending';
    final color = verified
        ? Colors.green
        : pending
        ? Colors.orange
        : Colors.blueGrey;
    final message = verified
        ? tr('seller_verified_banner')
        : pending
        ? tr('seller_pending_banner')
        : tr('seller_unverified_banner');
    return Card(
      color: color.withValues(alpha: 0.10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              verified ? Icons.verified_outlined : Icons.info_outline,
              color: color,
            ),
            const SizedBox(width: 10),
            Expanded(child: Text(message)),
            if (!verified && !pending)
              TextButton(
                onPressed: _openVerification,
                child: Text(tr('seller_start_verification')),
              ),
          ],
        ),
      ),
    );
  }

  String _statusLabel(Map<String, dynamic> product) {
    return switch (product['status']?.toString()) {
      'active' => tr('product_status_active'),
      'out_of_stock' => tr('product_status_out_of_stock'),
      'archived' => tr('product_status_archived'),
      _ => tr('product_status_draft'),
    };
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
            ? ListView(
                children: [
                  const SizedBox(height: 160),
                  Center(child: Text(_error!, textAlign: TextAlign.center)),
                  Center(
                    child: TextButton(
                      onPressed: _load,
                      child: Text(tr('retry')),
                    ),
                  ),
                ],
              )
            : _products.isEmpty
            ? ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 110),
                children: [
                  _publicationBanner(),
                  const SizedBox(height: 90),
                  const Icon(
                    Icons.inventory_2_outlined,
                    size: 64,
                    color: Colors.grey,
                  ),
                  const SizedBox(height: 12),
                  Center(child: Text(tr('seller_no_products'))),
                  const SizedBox(height: 12),
                  Center(
                    child: FilledButton.icon(
                      onPressed: () => _openEditor(),
                      icon: const Icon(Icons.add),
                      label: Text(tr('seller_add_first_product')),
                    ),
                  ),
                ],
              )
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 110),
                itemCount: _products.length + 1,
                separatorBuilder: (_, _) => const SizedBox(height: 10),
                itemBuilder: (context, index) {
                  if (index == 0) return _publicationBanner();
                  final product = _products[index - 1];
                  final images =
                      product['images'] as List<dynamic>? ?? const [];
                  final price =
                      ((product['price_piasters'] as num?)?.toInt() ?? 0) / 100;
                  return Card(
                    child: ListTile(
                      leading: ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: images.isEmpty
                            ? const SizedBox(
                                width: 58,
                                child: Icon(Icons.image_outlined),
                              )
                            : Image.network(
                                images.first.toString(),
                                width: 58,
                                height: 58,
                                fit: BoxFit.cover,
                                errorBuilder: (_, _, _) => const SizedBox(
                                  width: 58,
                                  child: Icon(Icons.broken_image_outlined),
                                ),
                              ),
                      ),
                      title: Text(product['title']?.toString() ?? ''),
                      subtitle: Text(
                        tr(
                          'seller_product_subtitle',
                          namedArgs: {
                            'price': price.toStringAsFixed(2),
                            'stock': product['stock_quantity'] ?? 0,
                            'status': _statusLabel(product),
                          },
                        ),
                      ),
                      trailing: PopupMenuButton<String>(
                        onSelected: (value) => value == 'edit'
                            ? _openEditor(product)
                            : _archive(product),
                        itemBuilder: (_) => [
                          PopupMenuItem(value: 'edit', child: Text(tr('edit'))),
                          PopupMenuItem(
                            value: 'archive',
                            child: Text(tr('product_archive')),
                          ),
                        ],
                      ),
                      onTap: () => _openEditor(product),
                    ),
                  );
                },
              ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openEditor(),
        icon: const Icon(Icons.add),
        label: Text(tr('add_product')),
      ),
    );
  }
}

class ProductEditorScreen extends StatefulWidget {
  final Map<String, dynamic>? product;

  const ProductEditorScreen({super.key, this.product});

  @override
  State<ProductEditorScreen> createState() => _ProductEditorScreenState();
}

class _ProductEditorScreenState extends State<ProductEditorScreen> {
  final _formKey = GlobalKey<FormState>();
  late final INetworkManager _network;
  late final TextEditingController _title;
  late final TextEditingController _description;
  late final TextEditingController _category;
  late final TextEditingController _price;
  late final TextEditingController _moq;
  late final TextEditingController _stock;
  late final TextEditingController _unit;
  late final TextEditingController _sku;
  late final TextEditingController _tiers;
  late final TextEditingController _costPrice;
  late final TextEditingController _discount;
  late final TextEditingController _unitsPerSale;
  late final TextEditingController _leadTime;
  late final TextEditingController _returnPolicy;
  late final TextEditingController _specifications;
  late final TextEditingController _faqs;
  late final TextEditingController _videoUrls;
  String _saleType = 'piece';
  XFile? _pickedImage;
  bool _publish = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final product = widget.product;
    _network = ServiceLocator.network();
    _title = TextEditingController(text: product?['title']?.toString() ?? '');
    _description = TextEditingController(
      text: product?['description']?.toString() ?? '',
    );
    _category = TextEditingController(
      text: product?['category']?.toString() ?? '',
    );
    _price = TextEditingController(
      text: product == null
          ? ''
          : (((product['price_piasters'] as num?) ?? 0) / 100).toStringAsFixed(
              2,
            ),
    );
    _moq = TextEditingController(text: product?['moq']?.toString() ?? '1');
    _stock = TextEditingController(
      text: product?['stock_quantity']?.toString() ?? '0',
    );
    _unit = TextEditingController(text: product?['unit']?.toString() ?? 'قطعة');
    _sku = TextEditingController(text: product?['sku']?.toString() ?? '');
    _costPrice = TextEditingController(
      text: product == null
          ? ''
          : (((product['cost_price_piasters'] as num?) ?? 0) / 100)
                .toStringAsFixed(2),
    );
    _discount = TextEditingController(
      text: product?['discount_percent']?.toString() ?? '0',
    );
    _unitsPerSale = TextEditingController(
      text: product?['units_per_sale']?.toString() ?? '1',
    );
    _leadTime = TextEditingController(
      text: product?['lead_time_days']?.toString() ?? '1',
    );
    _returnPolicy = TextEditingController(
      text: product?['return_policy']?.toString() ?? '',
    );
    _videoUrls = TextEditingController(
      text: (product?['video_urls'] as List<dynamic>? ?? const [])
          .map((value) => value.toString())
          .join('\n'),
    );
    _saleType = product?['sale_type']?.toString() ?? 'piece';
    final specifications = product?['specifications'] as Map? ?? const {};
    _specifications = TextEditingController(
      text: specifications.entries
          .map((entry) => '${entry.key}:${entry.value}')
          .join('\n'),
    );
    final faqs = product?['faqs'] as List<dynamic>? ?? const [];
    _faqs = TextEditingController(
      text: faqs
          .map((raw) {
            final faq = raw as Map;
            return '${faq['question']}|${faq['answer']}';
          })
          .join('\n'),
    );
    final tiers = product?['price_tiers'] as List<dynamic>? ?? const [];
    _tiers = TextEditingController(
      text: tiers
          .map((raw) {
            final tier = raw as Map;
            final tierPrice =
                ((tier['unit_price_piasters'] as num?) ?? 0) / 100;
            return '${tier['min_quantity']}:${tierPrice.toStringAsFixed(2)}';
          })
          .join('\n'),
    );
    _publish = product?['status'] == 'active';
  }

  @override
  void dispose() {
    for (final controller in [
      _title,
      _description,
      _category,
      _price,
      _moq,
      _stock,
      _unit,
      _sku,
      _tiers,
      _costPrice,
      _discount,
      _unitsPerSale,
      _leadTime,
      _returnPolicy,
      _specifications,
      _faqs,
      _videoUrls,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  List<Map<String, int>> _parseTiers() {
    if (_tiers.text.trim().isEmpty) return [];
    final seen = <int>{};
    return _tiers.text.split('\n').where((line) => line.trim().isNotEmpty).map((
      line,
    ) {
      final parts = line.split(':');
      final quantity = parts.length == 2 ? int.tryParse(parts[0].trim()) : null;
      final price = parts.length == 2
          ? double.tryParse(parts[1].trim().replaceAll(',', '.'))
          : null;
      if (quantity == null ||
          quantity < 1 ||
          price == null ||
          price <= 0 ||
          !seen.add(quantity)) {
        throw FormatException(tr('seller_tiers_format'));
      }
      return {
        'min_quantity': quantity,
        'unit_price_piasters': (price * 100).round(),
      };
    }).toList();
  }

  Map<String, String> _parseSpecifications() {
    final result = <String, String>{};
    for (final line in _specifications.text.split('\n')) {
      if (line.trim().isEmpty) continue;
      final separator = line.indexOf(':');
      if (separator < 1 || separator == line.length - 1) {
        throw FormatException(tr('seller_spec_format'));
      }
      result[line.substring(0, separator).trim()] = line
          .substring(separator + 1)
          .trim();
    }
    return result;
  }

  List<Map<String, String>> _parseFaqs() {
    return _faqs.text.split('\n').where((line) => line.trim().isNotEmpty).map((
      line,
    ) {
      final separator = line.indexOf('|');
      if (separator < 3 || separator == line.length - 1) {
        throw FormatException(tr('seller_faq_format'));
      }
      return {
        'question': line.substring(0, separator).trim(),
        'answer': line.substring(separator + 1).trim(),
      };
    }).toList();
  }

  Future<String?> _uploadImage() async {
    if (_pickedImage == null) return null;
    final bytes = await _pickedImage!.readAsBytes();
    final mime =
        _pickedImage!.mimeType ??
        (_pickedImage!.name.toLowerCase().endsWith('.png')
            ? 'image/png'
            : 'image/jpeg');
    final response = await _network.post<Map<String, dynamic>>(
      '/upload',
      data: {
        'fileData': 'data:$mime;base64,${base64Encode(bytes)}',
        'fileType': 'image',
        'mimeType': mime,
      },
    );
    return (response['media'] as Map)['url']?.toString();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final existingImages =
        (widget.product?['images'] as List<dynamic>? ?? const [])
            .map((item) => item.toString())
            .toList();
    if (_pickedImage == null && existingImages.isEmpty) {
      ErrorHandler.showSecureSnackBar(
        context,
        tr('seller_pick_image_required'),
        isError: true,
      );
      return;
    }
    setState(() => _saving = true);
    try {
      final tiers = _parseTiers();
      final uploaded = await _uploadImage();
      final price = double.parse(_price.text.trim().replaceAll(',', '.'));
      final data = {
        'title': _title.text.trim(),
        'description': _description.text.trim(),
        'category': _category.text.trim(),
        'price_piasters': (price * 100).round(),
        'price_tiers': tiers,
        'moq': int.parse(_moq.text.trim()),
        'stock_quantity': int.parse(_stock.text.trim()),
        'unit': _unit.text.trim(),
        'sale_type': _saleType,
        'units_per_sale': int.parse(_unitsPerSale.text.trim()),
        'cost_price_piasters':
            ((_costPrice.text.trim().isEmpty
                        ? 0
                        : double.parse(
                            _costPrice.text.trim().replaceAll(',', '.'),
                          )) *
                    100)
                .round(),
        'discount_percent': double.parse(
          _discount.text.trim().replaceAll(',', '.'),
        ),
        'lead_time_days': int.parse(_leadTime.text.trim()),
        'return_policy': _returnPolicy.text.trim(),
        'specifications': _parseSpecifications(),
        'faqs': _parseFaqs(),
        'images': uploaded == null
            ? existingImages
            : [uploaded, ...existingImages.take(7)],
        'video_urls': _videoUrls.text
            .split('\n')
            .map((value) => value.trim())
            .where((value) => value.isNotEmpty)
            .take(8)
            .toList(),
        'tags': <String>[],
        if (_sku.text.trim().isNotEmpty) 'sku': _sku.text.trim(),
        'publish': _publish,
      };
      Map<String, dynamic> response;
      if (widget.product == null) {
        response = await _network.post<Map<String, dynamic>>(
          '/products',
          data: data,
        );
      } else {
        response = await _network.patch<Map<String, dynamic>>(
          '/products/${widget.product!['_id']}',
          data: data,
        );
      }
      if (!mounted) return;
      final product = response['product'] as Map?;
      final status = product?['status']?.toString() ?? 'draft';
      if (_publish && status != 'active') {
        final message = status == 'out_of_stock'
            ? tr('seller_saved_no_stock')
            : tr('seller_saved_draft');
        await showDialog<void>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            icon: const Icon(Icons.visibility_off_outlined),
            title: Text(tr('seller_product_not_visible')),
            content: Text(message),
            actions: [
              FilledButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: Text(tr('understood')),
              ),
            ],
          ),
        );
      } else {
        ErrorHandler.showSecureSnackBar(
          context,
          status == 'active'
              ? tr('seller_saved_published')
              : tr('seller_saved_as_draft'),
          isError: false,
        );
      }
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        ErrorHandler.showSecureSnackBar(
          context,
          error is FormatException
              ? error.message
              : ErrorHandler.getUserFriendlyMessage(error),
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String? _required(String? value, {int min = 1}) =>
      (value?.trim().length ?? 0) < min ? tr('field_required') : null;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.product == null ? tr('product_new') : tr('product_edit'),
        ),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _title,
              decoration: InputDecoration(labelText: tr('product_name')),
              validator: (value) => _required(value, min: 3),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _description,
              maxLines: 3,
              decoration: InputDecoration(labelText: tr('product_description')),
              validator: (value) => _required(value, min: 10),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _category,
              decoration: InputDecoration(labelText: tr('product_category')),
              validator: (value) => _required(value, min: 2),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _price,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: InputDecoration(
                labelText: tr('product_unit_price_egp'),
              ),
              validator: (value) =>
                  (double.tryParse((value ?? '').replaceAll(',', '.')) ?? 0) <=
                      0
                  ? tr('product_price_invalid')
                  : null,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _moq,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(labelText: tr('moq_label')),
                    validator: (value) => (int.tryParse(value ?? '') ?? 0) < 1
                        ? tr('invalid_value')
                        : null,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextFormField(
                    controller: _stock,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(labelText: tr('stock')),
                    validator: (value) => (int.tryParse(value ?? '') ?? -1) < 0
                        ? tr('invalid_value')
                        : null,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextFormField(
                    controller: _unit,
                    decoration: InputDecoration(labelText: tr('unit')),
                    validator: _required,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _sku,
              decoration: InputDecoration(labelText: tr('sku_optional')),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _saleType,
              decoration: InputDecoration(labelText: tr('catalog_sale_type')),
              items: [
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
                  setState(() => _saleType = value ?? 'piece'),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _unitsPerSale,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      labelText: tr('product_units_per_sale'),
                    ),
                    validator: (value) => (int.tryParse(value ?? '') ?? 0) < 1
                        ? tr('invalid_value')
                        : null,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextFormField(
                    controller: _discount,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: InputDecoration(labelText: tr('discount_pct')),
                    validator: (value) {
                      final number =
                          double.tryParse((value ?? '').replaceAll(',', '.')) ??
                          -1;
                      return number < 0 || number > 95
                          ? tr('discount_range')
                          : null;
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _costPrice,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: InputDecoration(
                      labelText: tr('product_unit_cost'),
                      helperText: tr('product_cost_helper'),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextFormField(
                    controller: _leadTime,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      labelText: tr('product_lead_time'),
                    ),
                    validator: (value) => (int.tryParse(value ?? '') ?? -1) < 0
                        ? tr('invalid_value')
                        : null,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _returnPolicy,
              maxLines: 2,
              decoration: InputDecoration(
                labelText: tr('product_return_policy'),
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _specifications,
              maxLines: 4,
              decoration: InputDecoration(
                labelText: tr('catalog_specifications'),
                hintText: tr('product_spec_hint'),
                helperText: tr('product_spec_helper'),
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _faqs,
              maxLines: 5,
              decoration: InputDecoration(
                labelText: tr('catalog_faqs'),
                hintText: tr('product_faq_hint'),
                helperText: tr('product_faq_helper'),
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _tiers,
              maxLines: 4,
              decoration: InputDecoration(
                labelText: tr('product_tier_label'),
                hintText: tr('product_tier_hint'),
                helperText: tr('product_tier_helper'),
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _saving
                  ? null
                  : () async {
                      final picked = await ImagePicker().pickImage(
                        source: ImageSource.gallery,
                        imageQuality: 82,
                        maxWidth: 1800,
                      );
                      if (picked != null && mounted) {
                        setState(() => _pickedImage = picked);
                      }
                    },
              icon: const Icon(Icons.image_outlined),
              label: Text(
                _pickedImage == null ? tr('choose_image') : _pickedImage!.name,
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _videoUrls,
              maxLines: 3,
              decoration: InputDecoration(
                labelText: tr('product_video_urls'),
                hintText: tr('product_video_hint'),
                helperText: tr('product_video_helper'),
              ),
            ),
            SwitchListTile(
              value: _publish,
              onChanged: _saving
                  ? null
                  : (value) => setState(() => _publish = value),
              title: Text(tr('product_publish_in_catalog')),
              subtitle: Text(tr('product_publish_subtitle')),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const CircularProgressIndicator()
                  : Text(tr('save_product')),
            ),
          ],
        ),
      ),
    );
  }
}
