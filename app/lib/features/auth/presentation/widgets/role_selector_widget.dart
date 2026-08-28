import 'package:flutter/material.dart';
import 'package:easy_localization/easy_localization.dart';
import '../../data/models/auth_models.dart';

/// Returns the localized display label for a role.
String roleLabel(UserRole role) {
  switch (role) {
    case UserRole.wholesaler:
      return tr('role_wholesaler');
    case UserRole.retailer:
      return tr('role_retailer');
    case UserRole.shipper:
      return tr('role_shipper');
  }
}

/// Returns the localized description for a role.
String roleDescription(UserRole role) {
  switch (role) {
    case UserRole.wholesaler:
      return tr('role_wholesaler_desc');
    case UserRole.retailer:
      return tr('role_retailer_desc');
    case UserRole.shipper:
      return tr('role_shipper_desc');
  }
}

/// Secure B2B Role Selector Widget supporting Wholesaler, Retailer, and Shipper roles.
class RoleSelectorWidget extends StatelessWidget {
  final UserRole selectedRole;
  final ValueChanged<UserRole> onRoleChanged;

  const RoleSelectorWidget({
    super.key,
    required this.selectedRole,
    required this.onRoleChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          tr('select_account_role'),
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.bold,
            color: Colors.black87,
          ),
        ),
        const SizedBox(height: 8),
        RadioGroup<UserRole>(
          groupValue: selectedRole,
          onChanged: (value) {
            if (value != null) onRoleChanged(value);
          },
          child: Column(
            children: UserRole.values.map((role) {
              final isSelected = selectedRole == role;
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                decoration: BoxDecoration(
                  color: isSelected ? Colors.blue[50] : Colors.grey[50],
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: isSelected ? Colors.blueAccent : Colors.grey[300]!,
                    width: isSelected ? 2 : 1,
                  ),
                ),
                child: RadioListTile<UserRole>(
                  value: role,
                  activeColor: Colors.blueAccent,
                  title: Text(
                    roleLabel(role),
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: isSelected ? Colors.blue[900] : Colors.black87,
                    ),
                  ),
                  subtitle: Text(
                    roleDescription(role),
                    style: TextStyle(fontSize: 12, color: Colors.grey[700]),
                  ),
                ),
              );
            }).toList(),
          ),
        ),
      ],
    );
  }
}
