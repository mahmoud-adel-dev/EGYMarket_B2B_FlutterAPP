import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../../core/network/network_manager.dart';
import '../../data/models/profile_models.dart';

part 'profile_settings_state.dart';

class ProfileSettingsCubit extends Cubit<ProfileSettingsState> {
  final INetworkManager _networkManager;

  ProfileSettingsCubit({required this._networkManager})
    : super(ProfileSettingsInitial());

  Future<void> fetchProfile() async {
    emit(ProfileSettingsLoading());
    try {
      final res = await _networkManager.get<Map<String, dynamic>>(
        '/profile',
        requiresAuth: true,
      );
      final profile = ProfileModel.fromJson(res);
      emit(ProfileSettingsLoaded(profile));
    } catch (e) {
      emit(ProfileSettingsError(e.toString()));
    }
  }

  Future<void> updateProfile(Map<String, dynamic> data) async {
    final currentState = state;
    if (currentState is! ProfileSettingsLoaded) return;
    emit(ProfileSettingsUpdating(currentState.profile));
    try {
      final res = await _networkManager.put<Map<String, dynamic>>(
        '/profile',
        data: data,
      );
      final updated = ProfileModel.fromJson(res);
      emit(ProfileSettingsUpdateSuccess(updated));
    } catch (e) {
      emit(ProfileSettingsError(e.toString()));
    }
  }
}
