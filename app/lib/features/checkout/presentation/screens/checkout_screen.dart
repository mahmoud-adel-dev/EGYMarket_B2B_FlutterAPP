import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../../core/constants/governorates.dart';
import '../../../../core/di/service_locator.dart';
import '../../../cart/data/models/cart_item_model.dart';
import '../../data/models/shipper_model.dart';
import '../cubit/checkout_cubit.dart';
import '../cubit/checkout_state.dart';

class CheckoutScreen extends StatelessWidget {
  final double totalAmount;
  final List<CartItemModel> cartItems;

  const CheckoutScreen({
    super.key,
    required this.totalAmount,
    required this.cartItems,
  });

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => CheckoutCubit(networkManager: ServiceLocator.network())
        ..initializeCheckout(
          origin: cartItems.firstOrNull?.sellerGovernorate ?? 'القاهرة',
        ),
      child: _CheckoutView(totalAmount: totalAmount, cartItems: cartItems),
    );
  }
}

class _CheckoutView extends StatefulWidget {
  final double totalAmount;
  final List<CartItemModel> cartItems;
  const _CheckoutView({required this.totalAmount, required this.cartItems});

  @override
  State<_CheckoutView> createState() => _CheckoutViewState();
}

class _CheckoutViewState extends State<_CheckoutView> {
  final _formKey = GlobalKey<FormState>();
  final _address = TextEditingController();
  final _contactName = TextEditingController();
  final _phone = TextEditingController();
  String _governorate = 'القاهرة';

  @override
  void dispose() {
    _address.dispose();
    _contactName.dispose();
    _phone.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('checkout_wholesale_title'))),
      body: BlocConsumer<CheckoutCubit, CheckoutState>(
        listener: (context, state) {
          if (state is CheckoutError) {
            ScaffoldMessenger.of(
              context,
            ).showSnackBar(SnackBar(content: Text(state.message)));
          }
          if (state is CheckoutSuccess) {
            showDialog<void>(
              context: context,
              barrierDismissible: false,
              builder: (dialogContext) => AlertDialog(
                title: Text(tr('checkout_order_submitted')),
                content: Text(
                  tr(
                    'checkout_success_message',
                    namedArgs: {'orderNumber': state.orderNumber},
                  ),
                ),
                actions: [
                  TextButton(
                    onPressed: () {
                      Navigator.of(dialogContext).pop();
                      Navigator.of(context).pop(true);
                    },
                    child: Text(tr('ok')),
                  ),
                ],
              ),
            );
          }
        },
        builder: (context, state) {
          if (state is CheckoutLoading || state is CheckoutInitial) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state is! CheckoutLoaded) return const SizedBox.shrink();
          final shipping =
              state.fulfillmentMethod == FulfillmentMethod.thirdPartyShipping;
          return Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          tr('order_summary'),
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 17,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          tr(
                            'checkout_items_summary',
                            namedArgs: {
                              'count': '${widget.cartItems.length}',
                              'price': widget.totalAmount.toStringAsFixed(2),
                            },
                          ),
                        ),
                        Text(tr('checkout_platform_fee')),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                SegmentedButton<FulfillmentMethod>(
                  segments: [
                    ButtonSegment(
                      value: FulfillmentMethod.buyerPickup,
                      label: Text(tr('checkout_buyer_pickup')),
                      icon: const Icon(Icons.store),
                    ),
                    ButtonSegment(
                      value: FulfillmentMethod.thirdPartyShipping,
                      label: Text(tr('checkout_shipping_company')),
                      icon: const Icon(Icons.local_shipping),
                    ),
                  ],
                  selected: {state.fulfillmentMethod},
                  onSelectionChanged: (selection) => context
                      .read<CheckoutCubit>()
                      .setFulfillment(selection.first),
                ),
                if (shipping) ...[
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    initialValue: _governorate,
                    decoration: InputDecoration(
                      labelText: tr('checkout_delivery_governorate'),
                    ),
                    items: egyptGovernorates
                        .map(
                          (value) => DropdownMenuItem(
                            value: value,
                            child: Text(value),
                          ),
                        )
                        .toList(),
                    onChanged: (value) {
                      if (value == null) return;
                      _governorate = value;
                      context.read<CheckoutCubit>().fetchShippers(
                        destination: value,
                      );
                    },
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _address,
                    decoration: InputDecoration(
                      labelText: tr('checkout_detailed_address'),
                    ),
                    validator: (value) => (value?.trim().length ?? 0) < 5
                        ? tr('checkout_address_required')
                        : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _contactName,
                    decoration: InputDecoration(
                      labelText: tr('checkout_recipient_name'),
                    ),
                    validator: (value) => (value?.trim().length ?? 0) < 2
                        ? tr('checkout_recipient_name_required')
                        : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    decoration: InputDecoration(
                      labelText: tr('checkout_recipient_phone'),
                    ),
                    validator: (value) => (value?.trim().length ?? 0) < 8
                        ? tr('checkout_phone_required')
                        : null,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    tr('checkout_shipping_company'),
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  if (state.availableShippers.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Text(tr('checkout_no_shipper')),
                    )
                  else
                    RadioGroup<String>(
                      groupValue: state.selectedShipper?.rateId,
                      onChanged: (rateId) {
                        if (rateId == null) return;
                        final shipper = state.availableShippers.firstWhere(
                          (item) => item.rateId == rateId,
                        );
                        context.read<CheckoutCubit>().selectShipper(shipper);
                      },
                      child: Column(
                        children: state.availableShippers
                            .map(
                              (shipper) => RadioListTile<String>(
                                value: shipper.rateId,
                                title: Text(shipper.name),
                                subtitle: Text(
                                  tr(
                                    'checkout_shipper_option',
                                    namedArgs: {
                                      'price': shipper.shippingFee
                                          .toStringAsFixed(2),
                                      'days': '${shipper.estimatedDays}',
                                    },
                                  ),
                                ),
                              ),
                            )
                            .toList(),
                      ),
                    ),
                ],
                const SizedBox(height: 24),
                SizedBox(
                  height: 52,
                  child: ElevatedButton(
                    onPressed: state.isSubmitting
                        ? null
                        : () {
                            if (shipping &&
                                !(_formKey.currentState?.validate() ?? false)) {
                              return;
                            }
                            context.read<CheckoutCubit>().completeOrder(
                              cartItems: widget.cartItems,
                              address: _address.text.trim(),
                              contactName: _contactName.text.trim(),
                              phone: _phone.text.trim(),
                            );
                          },
                    child: state.isSubmitting
                        ? const CircularProgressIndicator(color: Colors.white)
                        : Text(tr('checkout_submit_order')),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
