import 'package:flutter/material.dart';
import '../../data/models/auth_models.dart';

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
        const Text(
          'Select Account Role',
          style: TextStyle(
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
                    role.displayName,
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: isSelected ? Colors.blue[900] : Colors.black87,
                    ),
                  ),
                  subtitle: Text(
                    role.description,
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
