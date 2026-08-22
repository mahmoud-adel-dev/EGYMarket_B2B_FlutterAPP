part of 'profile_settings_cubit.dart';

abstract class ProfileSettingsState {}

class ProfileSettingsInitial extends ProfileSettingsState {}

class ProfileSettingsLoading extends ProfileSettingsState {}

class ProfileSettingsLoaded extends ProfileSettingsState {
  final ProfileModel profile;
  ProfileSettingsLoaded(this.profile);
}

class ProfileSettingsUpdating extends ProfileSettingsState {
  final ProfileModel profile;
  ProfileSettingsUpdating(this.profile);
}

class ProfileSettingsUpdateSuccess extends ProfileSettingsLoaded {
  ProfileSettingsUpdateSuccess(super.profile);
}

class ProfileSettingsError extends ProfileSettingsState {
  final String message;
  ProfileSettingsError(this.message);
}
