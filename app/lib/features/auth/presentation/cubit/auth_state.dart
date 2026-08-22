import 'package:flutter/foundation.dart';
import '../../data/models/auth_models.dart';

@immutable
abstract class AuthState {}

class AuthInitial extends AuthState {}

class AuthLoading extends AuthState {}

class AuthenticatedState extends AuthState {
  final AuthUserModel user;

  AuthenticatedState(this.user);
}

class UnauthenticatedState extends AuthState {}

/// A stored session exists but could not be verified because of a transient
/// network/server problem. The session is preserved; the UI should offer retry.
class AuthRestoreFailedState extends AuthState {}

class RegistrationPendingVerificationState extends AuthState {
  final String email;
  final String deliveryStatus;
  final String? developmentToken;

  RegistrationPendingVerificationState({
    required this.email,
    required this.deliveryStatus,
    this.developmentToken,
  });
}

class AuthErrorState extends AuthState {
  final String message;

  AuthErrorState(this.message);
}
