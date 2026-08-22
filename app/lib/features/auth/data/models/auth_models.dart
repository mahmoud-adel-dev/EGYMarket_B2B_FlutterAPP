enum UserRole {
  wholesaler('Wholesaler', 'Wholesaler / Distributor selling products in bulk'),
  retailer('Retailer', 'Retailer / Merchant buying inventory for resale'),
  shipper('Shipper', 'Logistics / Carrier managing order shipments');

  final String displayName;
  final String description;
  const UserRole(this.displayName, this.description);

  static UserRole fromString(String? value) {
    switch (value?.toLowerCase()) {
      case 'wholesaler':
        return UserRole.wholesaler;
      case 'shipper':
        return UserRole.shipper;
      default:
        return UserRole.retailer;
    }
  }

  String toParamString() => name.toLowerCase();
}

class AuthUserModel {
  final String id;
  final String name;
  final String email;
  final String phone;
  final UserRole role;
  final String? organizationId;
  final String? organizationMemberRole;

  const AuthUserModel({
    required this.id,
    required this.name,
    required this.email,
    required this.phone,
    required this.role,
    this.organizationId,
    this.organizationMemberRole,
  });

  factory AuthUserModel.fromJson(Map<String, dynamic> json) {
    final userData = json['user'] is Map<String, dynamic>
        ? json['user'] as Map<String, dynamic>
        : json;
    return AuthUserModel(
      id: (userData['id'] ?? userData['_id'])?.toString() ?? '',
      name: userData['name']?.toString() ?? '',
      email: userData['email']?.toString() ?? '',
      phone: userData['phone']?.toString() ?? '',
      role: UserRole.fromString(userData['role']?.toString()),
      organizationId:
          (userData['organization_id'] ?? userData['organizationId'])
              ?.toString(),
      organizationMemberRole: userData['organization_member_role']?.toString(),
    );
  }
}

class LoginRequest {
  final String email;
  final String password;

  const LoginRequest({required this.email, required this.password});

  Map<String, dynamic> toJson() => {
    'email': email.trim().toLowerCase(),
    'password': password,
  };
}

class RegisterRequest {
  final String ownerName;
  final String businessName;
  final String email;
  final String phone;
  final String password;
  final UserRole role;
  final String governorate;
  final String? address;
  final List<String>? interestedCategories;
  final bool acceptedTerms;

  const RegisterRequest({
    required this.ownerName,
    required this.businessName,
    required this.email,
    required this.phone,
    required this.password,
    required this.role,
    this.governorate = 'Cairo',
    this.address,
    this.interestedCategories,
    required this.acceptedTerms,
  });

  Map<String, dynamic> toJson() => {
    'name': ownerName.trim(),
    'business_name': businessName.trim(),
    'email': email.trim().toLowerCase(),
    'phone': phone.trim(),
    'password': password,
    'role': role.displayName,
    'accepted_terms': acceptedTerms,
    'location': {
      'governorate': governorate,
      if (address != null && address!.isNotEmpty) 'address': address,
    },
    if (interestedCategories != null && interestedCategories!.isNotEmpty)
      'interested_categories': interestedCategories,
  };
}
