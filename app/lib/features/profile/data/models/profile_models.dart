import 'package:seals_app/features/auth/data/models/auth_models.dart';

class ProfileModel {
  final String id;
  final String name;
  final String email;
  final String phone;
  final String role;
  final String? avatarUrl;
  final String? coverUrl;
  final String? businessName;
  final String? businessDescription;
  final ProfileLocation? location;
  final ProfileContactMethods? contactMethods;
  final ProfilePaymentSettings? paymentSettings;
  final String? createdAt;

  ProfileModel({
    required this.id,
    required this.name,
    required this.email,
    required this.phone,
    required this.role,
    this.avatarUrl,
    this.coverUrl,
    this.businessName,
    this.businessDescription,
    this.location,
    this.contactMethods,
    this.paymentSettings,
    this.createdAt,
  });

  factory ProfileModel.fromJson(Map<String, dynamic> json) {
    final data = json['user'] is Map<String, dynamic>
        ? json['user'] as Map<String, dynamic>
        : json;
    return ProfileModel(
      id: (data['id'] ?? data['_id'] ?? '') as String,
      name: (data['name'] ?? '') as String,
      email: (data['email'] ?? '') as String,
      phone: (data['phone'] ?? '') as String,
      role: (data['role'] ?? 'Retailer') as String,
      avatarUrl: data['avatar_url'] as String?,
      coverUrl: data['cover_url'] as String?,
      businessName: data['business_name'] as String?,
      businessDescription: data['business_description'] as String?,
      location: data['location'] != null
          ? ProfileLocation.fromJson(data['location'] as Map<String, dynamic>)
          : null,
      contactMethods: data['contact_methods'] != null
          ? ProfileContactMethods.fromJson(
              data['contact_methods'] as Map<String, dynamic>,
            )
          : null,
      paymentSettings: data['paymentSettings'] != null
          ? ProfilePaymentSettings.fromJson(
              data['paymentSettings'] as Map<String, dynamic>,
            )
          : null,
      createdAt: data['createdAt'] as String?,
    );
  }

  UserRole get userRole => UserRole.fromString(role);
}

class ProfileLocation {
  final String governorate;
  final String? address;

  ProfileLocation({required this.governorate, this.address});

  factory ProfileLocation.fromJson(Map<String, dynamic> json) {
    return ProfileLocation(
      governorate: (json['governorate'] ?? '') as String,
      address: json['address'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'governorate': governorate,
    if (address != null) 'address': address,
  };
}

class ProfileContactMethods {
  final String? phone;
  final String? whatsapp;
  final String? email;

  ProfileContactMethods({this.phone, this.whatsapp, this.email});

  factory ProfileContactMethods.fromJson(Map<String, dynamic> json) {
    return ProfileContactMethods(
      phone: json['phone'] as String?,
      whatsapp: json['whatsapp'] as String?,
      email: json['email'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    if (phone != null) 'phone': phone,
    if (whatsapp != null) 'whatsapp': whatsapp,
    if (email != null) 'email': email,
  };
}

class ProfilePaymentSettings {
  final List<String> acceptedMethods;

  ProfilePaymentSettings({required this.acceptedMethods});

  factory ProfilePaymentSettings.fromJson(Map<String, dynamic> json) {
    return ProfilePaymentSettings(
      acceptedMethods:
          (json['accepted_methods'] as List?)
              ?.map((e) => e.toString())
              .toList() ??
          ['cash'],
    );
  }
}
