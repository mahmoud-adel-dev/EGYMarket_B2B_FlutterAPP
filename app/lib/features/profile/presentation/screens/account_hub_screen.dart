import 'package:flutter/material.dart';

import '../../../auth/data/models/auth_models.dart';
import '../../../checkout/presentation/screens/shipping_rates_management_screen.dart';
import '../../../wholesaler_profile/presentation/screens/merchant_payment_settings_screen.dart';
import '../../../wholesaler_profile/presentation/screens/subscription_plans_screen.dart';
import 'organization_verification_screen.dart';
import 'account_data_screen.dart';
import 'role_based_profile_screen.dart';

class AccountHubScreen extends StatelessWidget {
  final AuthUserModel user;

  const AccountHubScreen({super.key, required this.user});

  void _open(BuildContext context, Widget screen) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('الحساب والمنشأة')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _item(
            context,
            Icons.account_circle_outlined,
            'الملف الشخصي وبيانات المنشأة',
            const RoleBasedProfileScreen(),
          ),
          _item(
            context,
            Icons.verified_user_outlined,
            'توثيق المنشأة',
            const OrganizationVerificationScreen(),
          ),
          _item(
            context,
            Icons.workspace_premium_outlined,
            'الاشتراك والفواتير',
            SubscriptionPlansScreen(userRole: user.role.displayName),
          ),
          if (user.role != UserRole.retailer)
            _item(
              context,
              Icons.account_balance_wallet_outlined,
              'حسابات استلام التحويلات',
              const MerchantPaymentSettingsScreen(),
            ),
          if (user.role == UserRole.shipper && user.organizationId != null)
            _item(
              context,
              Icons.route_outlined,
              'تعريفات ومسارات الشحن',
              ShippingRatesManagementScreen(
                organizationId: user.organizationId!,
              ),
            ),
          _item(
            context,
            Icons.privacy_tip_outlined,
            'بياناتي والخصوصية وحذف الحساب',
            const AccountDataScreen(),
          ),
        ],
      ),
    );
  }

  Widget _item(
    BuildContext context,
    IconData icon,
    String title,
    Widget screen,
  ) {
    return Card(
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => _open(context, screen),
      ),
    );
  }
}
