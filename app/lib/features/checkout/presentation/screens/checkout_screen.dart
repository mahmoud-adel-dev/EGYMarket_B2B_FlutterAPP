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
      appBar: AppBar(title: const Text('إتمام طلب الجملة')),
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
                title: const Text('تم إرسال طلب الشراء'),
                content: Text(
                  'رقم الطلب: ${state.orderNumber}\nلن تدفع الآن. بعد قبول البائع ستظهر التزامات البضاعة ورسم المنصة 50 جنيهًا والشحن إن وجد.',
                ),
                actions: [
                  TextButton(
                    onPressed: () {
                      Navigator.of(dialogContext).pop();
                      Navigator.of(context).pop(true);
                    },
                    child: const Text('حسنًا'),
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
                        const Text(
                          'ملخص الطلب',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 17,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '${widget.cartItems.length} أصناف — ${widget.totalAmount.toStringAsFixed(2)} ج.م للبضاعة',
                        ),
                        const Text('رسم المنصة: 50.00 ج.م بعد قبول البائع'),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                SegmentedButton<FulfillmentMethod>(
                  segments: const [
                    ButtonSegment(
                      value: FulfillmentMethod.buyerPickup,
                      label: Text('استلام من البائع'),
                      icon: Icon(Icons.store),
                    ),
                    ButtonSegment(
                      value: FulfillmentMethod.thirdPartyShipping,
                      label: Text('شركة شحن'),
                      icon: Icon(Icons.local_shipping),
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
                    decoration: const InputDecoration(
                      labelText: 'محافظة التسليم',
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
                    decoration: const InputDecoration(
                      labelText: 'العنوان بالتفصيل',
                    ),
                    validator: (value) => (value?.trim().length ?? 0) < 5
                        ? 'أدخل العنوان بالتفصيل'
                        : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _contactName,
                    decoration: const InputDecoration(labelText: 'اسم المستلم'),
                    validator: (value) => (value?.trim().length ?? 0) < 2
                        ? 'أدخل اسم المستلم'
                        : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: 'هاتف المستلم',
                    ),
                    validator: (value) => (value?.trim().length ?? 0) < 8
                        ? 'أدخل رقم هاتف صحيح'
                        : null,
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'شركة الشحن',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  if (state.availableShippers.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: Text('لا توجد شركة تغطي هذا المسار حاليًا'),
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
                                  '${shipper.shippingFee.toStringAsFixed(2)} ج.م — ${shipper.estimatedDays} أيام',
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
                        : const Text('إرسال طلب الشراء للبائع'),
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
