import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'core/di/service_locator.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/presentation/cubit/auth_cubit.dart';
import 'features/auth/presentation/cubit/auth_state.dart';
import 'features/home/presentation/screens/main_tab_navigation_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await EasyLocalization.ensureInitialized();
  await dotenv.load(fileName: ".env");

  runApp(
    EasyLocalization(
      supportedLocales: const [Locale('en'), Locale('ar')],
      path: 'assets/translations',
      fallbackLocale: const Locale('en'),
      child: B2BMarketplaceApp(),
    ),
  );
}

class B2BMarketplaceApp extends StatelessWidget {
  const B2BMarketplaceApp({super.key});

  @override
  Widget build(BuildContext context) {
    final isArabic = context.locale.languageCode == 'ar';

    return BlocProvider<AuthCubit>(
      // The AuthCubit lives at the app root so locale changes and navigation
      // never recreate it (which would drop an in-flight session restore).
      create: (_) => AuthCubit(
        networkManager: ServiceLocator.network(),
        storageService: ServiceLocator.storage,
      )..checkAuthStatus(),
      child: MaterialApp(
        title: 'SEALS B2B Marketplace',
        debugShowCheckedModeBanner: false,
        localizationsDelegates: context.localizationDelegates,
        supportedLocales: context.supportedLocales,
        locale: context.locale,
        theme: AppTheme.light(isArabic: isArabic),
        home: const AuthWrapper(),
      ),
    );
  }
}

class AuthWrapper extends StatelessWidget {
  const AuthWrapper({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<AuthCubit, AuthState>(
      builder: (context, state) {
        if (state is AuthLoading) {
          return Scaffold(
            backgroundColor: AppColors.background,
            body: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(24),
                      gradient: const LinearGradient(
                        colors: [AppColors.navy, AppColors.primary],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.primary.withValues(alpha: 0.25),
                          blurRadius: 24,
                          spreadRadius: 4,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: const Icon(
                      Icons.storefront_rounded,
                      size: 40,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 28),
                  const CircularProgressIndicator(
                    color: AppColors.primary,
                    strokeWidth: 2.5,
                  ),
                  const SizedBox(height: 20),
                  Text(
                    'app_name'.tr(),
                    style: TextStyle(
                      color: AppColors.primary,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 3,
                    ),
                  ),
                ],
              ),
            ),
          );
        }

        if (state is AuthRestoreFailedState) {
          return Scaffold(
            backgroundColor: AppColors.background,
            body: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.cloud_off_rounded,
                    size: 56,
                    color: AppColors.textSecondary,
                  ),
                  const SizedBox(height: 16),
                  Text('restore_failed_title'.tr()),
                  const SizedBox(height: 24),
                  FilledButton.icon(
                    onPressed: () =>
                        context.read<AuthCubit>().retrySessionRestore(),
                    icon: const Icon(Icons.refresh_rounded),
                    label: Text('retry'.tr()),
                  ),
                ],
              ),
            ),
          );
        }

        // Guest Mode & Authenticated Mode both open MainTabNavigationScreen
        final user = state is AuthenticatedState ? state.user : null;
        // Reset role-specific tab children when the authenticated identity
        // changes. Without a key, a buyer catalog could briefly survive a
        // logout/login as a wholesaler and finish stale recommendation calls.
        return MainTabNavigationScreen(
          key: ValueKey(user?.id ?? 'guest'),
          user: user,
        );
      },
    );
  }
}
