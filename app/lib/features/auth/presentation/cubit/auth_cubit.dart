import 'package:dio/dio.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../../core/constants/api_constants.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../../core/errors/network_exception.dart';
import '../../../../core/network/network_manager.dart';
import '../../../../core/storage/secure_storage_service.dart';
import '../../data/models/auth_models.dart';
import 'auth_state.dart';

class AuthCubit extends Cubit<AuthState> {
  final INetworkManager _network;
  final ISecureStorageService _storage;

  AuthCubit({
    required INetworkManager networkManager,
    required ISecureStorageService storageService,
  }) : _network = networkManager,
       _storage = storageService,
       super(AuthInitial());

  Future<void> checkAuthStatus() async {
    emit(AuthLoading());
    try {
      // NextAuth's public session endpoint always returns 200. Checking it
      // first prevents a guest launch from generating a noisy /auth/me 401.
      final session = await _network.get<Map<String, dynamic>>(
        ApiConstants.session,
        requiresAuth: false,
      );
      final sessionUser = session['user'] as Map<String, dynamic>?;
      if (sessionUser?['id']?.toString().isNotEmpty != true) {
        await _storage.clearSession();
        emit(UnauthenticatedState());
        return;
      }
      final response = await _network.get<Map<String, dynamic>>(
        ApiConstants.me,
        requiresAuth: true,
      );
      final user = AuthUserModel.fromJson(response);
      await _cacheIdentity(user);
      emit(AuthenticatedState(user));
    } on NetworkException catch (error) {
      if (error.statusCode == 401 || error.statusCode == 403) {
        // Definitive server rejection: the stored session is invalid.
        await _storage.clearSession();
        emit(UnauthenticatedState());
        return;
      }
      // Network/timeout/5xx: keep the persisted cookies so the session can be
      // restored when connectivity returns. Dropping them here used to log
      // users out on every offline app start.
      final hasLocalSession = await _storage.hasNextAuthSession();
      emit(hasLocalSession ? AuthRestoreFailedState() : UnauthenticatedState());
    } catch (_) {
      await _storage.clearSession();
      emit(UnauthenticatedState());
    }
  }

  /// Retries session restoration after a transient failure.
  Future<void> retrySessionRestore() => checkAuthStatus();

  Future<void> login(LoginRequest request) async {
    emit(AuthLoading());
    try {
      final csrf = await _network.get<Map<String, dynamic>>(
        ApiConstants.csrf,
        requiresAuth: false,
      );
      final csrfToken = csrf['csrfToken']?.toString();
      if (csrfToken == null || csrfToken.isEmpty) {
        throw StateError('تعذر بدء جلسة تسجيل الدخول');
      }
      final response = await _network.post<Map<String, dynamic>>(
        ApiConstants.credentialsCallback,
        data: {
          ...request.toJson(),
          'csrfToken': csrfToken,
          'json': 'true',
          'redirect': 'false',
          'callbackUrl': '/',
        },
        options: Options(contentType: Headers.formUrlEncodedContentType),
        requiresAuth: false,
      );
      if (response['error'] != null ||
          response['url']?.toString().contains('error=') == true) {
        throw StateError(
          'البريد الإلكتروني أو كلمة المرور غير صحيحة، أو البريد غير مؤكد',
        );
      }
      final me = await _network.get<Map<String, dynamic>>(ApiConstants.me);
      final user = AuthUserModel.fromJson(me);
      await _cacheIdentity(user);
      emit(AuthenticatedState(user));
    } catch (error) {
      await _storage.clearSession();
      final message = error is NetworkException && error.statusCode == 401
          ? 'تعذر تسجيل الدخول. تحقق من كلمة المرور ومن تأكيد البريد الإلكتروني.'
          : ErrorHandler.getUserFriendlyMessage(error);
      emit(AuthErrorState(message));
    }
  }

  Future<void> register(RegisterRequest request) async {
    emit(AuthLoading());
    try {
      final response = await _network.post<Map<String, dynamic>>(
        ApiConstants.register,
        data: request.toJson(),
        requiresAuth: false,
      );
      final developmentToken = response['development_verification_token']
          ?.toString();
      var deliveryStatus =
          response['verification_delivery']?.toString() ?? 'sent';
      if (developmentToken != null && developmentToken.isNotEmpty) {
        await _network.post<Map<String, dynamic>>(
          '/auth/verify-email',
          data: {'token': developmentToken},
          requiresAuth: false,
        );
        deliveryStatus = 'development_verified';
      }
      emit(
        RegistrationPendingVerificationState(
          email: request.email,
          deliveryStatus: deliveryStatus,
          developmentToken: developmentToken,
        ),
      );
    } catch (error) {
      emit(AuthErrorState(ErrorHandler.getUserFriendlyMessage(error)));
    }
  }

  Future<bool> resendVerification(String email) async {
    final response = await _network.post<Map<String, dynamic>>(
      '/auth/resend-verification',
      data: {'email': email},
      requiresAuth: false,
    );
    final developmentToken = response['development_verification_token']
        ?.toString();
    if (developmentToken != null && developmentToken.isNotEmpty) {
      await _network.post<Map<String, dynamic>>(
        '/auth/verify-email',
        data: {'token': developmentToken},
        requiresAuth: false,
      );
      return true;
    }
    return false;
  }

  Future<void> logout() async {
    try {
      final csrf = await _network.get<Map<String, dynamic>>(
        ApiConstants.csrf,
        requiresAuth: false,
      );
      await _network.post<Map<String, dynamic>>(
        ApiConstants.signOut,
        data: {
          'csrfToken': csrf['csrfToken'],
          'json': 'true',
          'redirect': 'false',
          'callbackUrl': '/',
        },
        options: Options(contentType: Headers.formUrlEncodedContentType),
        requiresAuth: false,
      );
    } catch (_) {
      // Local session is still cleared if the network is unavailable.
    } finally {
      await _storage.clearSession();
      emit(UnauthenticatedState());
    }
  }

  Future<void> _cacheIdentity(AuthUserModel user) async {
    await Future.wait([
      _storage.saveUserRole(user.role.toParamString()),
      _storage.saveUserId(user.id),
    ]);
  }
}
