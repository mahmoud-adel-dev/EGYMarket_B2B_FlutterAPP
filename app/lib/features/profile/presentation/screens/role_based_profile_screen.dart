import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../../core/di/service_locator.dart';
import '../../../../core/utils/app_directionality.dart';
import '../../../auth/data/models/auth_models.dart';
import '../../../auth/presentation/widgets/role_selector_widget.dart';
import '../cubit/profile_settings_cubit.dart';
import 'edit_profile_screen.dart';

class RoleBasedProfileScreen extends StatelessWidget {
  const RoleBasedProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) =>
          ProfileSettingsCubit(networkManager: ServiceLocator.network())
            ..fetchProfile(),
      child: const _ProfileView(),
    );
  }
}

class _ProfileView extends StatelessWidget {
  const _ProfileView();

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<ProfileSettingsCubit, ProfileSettingsState>(
      listener: (context, state) {
        if (state is ProfileSettingsUpdateSuccess) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('${tr('profile_updated')} ✅'),
              backgroundColor: Colors.green,
            ),
          );
        } else if (state is ProfileSettingsError) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                tr(
                  'profile_error_prefix',
                  namedArgs: {'message': state.message},
                ),
              ),
              backgroundColor: Colors.redAccent,
            ),
          );
        }
      },
      builder: (context, state) {
        if (state is ProfileSettingsLoading) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        if (state is ProfileSettingsError) {
          return Scaffold(
            body: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.error_outline,
                    size: 48,
                    color: Colors.redAccent,
                  ),
                  const SizedBox(height: 12),
                  Text(state.message, textAlign: TextAlign.center),
                  const SizedBox(height: 16),
                  ElevatedButton.icon(
                    icon: const Icon(Icons.refresh),
                    label: Text(tr('retry')),
                    onPressed: () =>
                        context.read<ProfileSettingsCubit>().fetchProfile(),
                  ),
                ],
              ),
            ),
          );
        }

        final profile = state is ProfileSettingsLoaded
            ? state.profile
            : state is ProfileSettingsUpdating
            ? state.profile
            : null;

        if (profile == null) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        return Scaffold(
          backgroundColor: const Color(0xFFF8FAFC),
          body: CustomScrollView(
            slivers: [
              // Hero Cover + Avatar Header
              SliverAppBar(
                expandedHeight: 220,
                pinned: true,
                backgroundColor: const Color(0xFF0F172A),
                flexibleSpace: FlexibleSpaceBar(
                  background: Stack(
                    fit: StackFit.expand,
                    children: [
                      // Cover Photo
                      if (profile.coverUrl?.isNotEmpty ?? false)
                        Image.network(
                          profile.coverUrl!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => _buildDefaultCover(),
                        )
                      else
                        _buildDefaultCover(),
                      // Dark gradient overlay
                      Container(
                        decoration: const BoxDecoration(
                          gradient: LinearGradient(
                            colors: [Colors.transparent, Color(0xCC0F172A)],
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                actions: [
                  IconButton(
                    icon: const Icon(Icons.edit_rounded, color: Colors.white),
                    tooltip: tr('profile_edit'),
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => BlocProvider.value(
                            value: context.read<ProfileSettingsCubit>(),
                            child: EditProfileScreen(profile: profile),
                          ),
                        ),
                      );
                    },
                  ),
                ],
              ),

              SliverToBoxAdapter(
                child: Column(
                  children: [
                    // Avatar + Name Card
                    Transform.translate(
                      offset: const Offset(0, -40),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Column(
                          children: [
                            // Avatar
                            CircleAvatar(
                              radius: 48,
                              backgroundColor: Colors.white,
                              child: CircleAvatar(
                                radius: 44,
                                backgroundColor: Colors.blueGrey[100],
                                backgroundImage:
                                    (profile.avatarUrl?.isNotEmpty ?? false)
                                    ? NetworkImage(profile.avatarUrl!)
                                    : null,
                                child: (profile.avatarUrl?.isEmpty ?? true)
                                    ? Text(
                                        profile.name.isNotEmpty
                                            ? profile.name[0].toUpperCase()
                                            : '?',
                                        style: const TextStyle(
                                          fontSize: 36,
                                          fontWeight: FontWeight.bold,
                                          color: Colors.blueGrey,
                                        ),
                                      )
                                    : null,
                              ),
                            ),
                            const SizedBox(height: 12),
                            Text(
                              profile.businessName?.isNotEmpty ?? false
                                  ? profile.businessName!
                                  : profile.name,
                              style: const TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFF0F172A),
                              ),
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 4),
                            // Role Badge
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: _roleColor(
                                  profile.userRole,
                                ).withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(
                                  color: _roleColor(
                                    profile.userRole,
                                  ).withValues(alpha: 0.4),
                                ),
                              ),
                              child: Text(
                                roleLabel(profile.userRole),
                                style: TextStyle(
                                  color: _roleColor(profile.userRole),
                                  fontWeight: FontWeight.w600,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                            if (profile.businessDescription?.isNotEmpty ??
                                false) ...[
                              const SizedBox(height: 12),
                              Text(
                                profile.businessDescription!,
                                style: TextStyle(
                                  color: Colors.grey[700],
                                  fontSize: 14,
                                  height: 1.5,
                                ),
                                textAlign: TextAlign.center,
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),

                    // Info Cards
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _sectionTitle(context, tr('account_information')),
                          _infoCard([
                            _infoRow(
                              Icons.person_outline_rounded,
                              tr('profile_full_name'),
                              profile.name,
                            ),
                            _infoRow(
                              Icons.email_outlined,
                              tr('profile_email'),
                              profile.email,
                            ),
                            _infoRow(
                              Icons.phone_outlined,
                              tr('profile_phone'),
                              profile.phone,
                            ),
                            _infoRow(
                              Icons.location_on_outlined,
                              tr('governorate'),
                              profile.location?.governorate ?? '—',
                            ),
                            if (profile.location?.address?.isNotEmpty ?? false)
                              _infoRow(
                                Icons.home_outlined,
                                tr('profile_address'),
                                profile.location!.address!,
                              ),
                          ]),

                          ...[
                            _sectionTitle(
                              context,
                              tr('profile_business_details'),
                            ),
                            _infoCard([
                              _infoRow(
                                Icons.storefront_outlined,
                                tr('profile_business_name'),
                                profile.businessName ?? '—',
                              ),
                              if (profile
                                      .contactMethods
                                      ?.whatsapp
                                      ?.isNotEmpty ??
                                  false)
                                _infoRow(
                                  Icons.chat_bubble_outline_rounded,
                                  tr('profile_whatsapp'),
                                  profile.contactMethods!.whatsapp!,
                                ),
                              if (profile.contactMethods?.email?.isNotEmpty ??
                                  false)
                                _infoRow(
                                  Icons.alternate_email_rounded,
                                  tr('business_email'),
                                  profile.contactMethods!.email!,
                                ),
                            ]),
                          ],

                          // Edit Button
                          const SizedBox(height: 24),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              icon: const Icon(Icons.edit_rounded, size: 18),
                              label: Text(tr('profile_edit_my')),
                              onPressed: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => BlocProvider.value(
                                      value: context
                                          .read<ProfileSettingsCubit>(),
                                      child: EditProfileScreen(
                                        profile: profile,
                                      ),
                                    ),
                                  ),
                                );
                              },
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF3B82F6),
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(
                                  vertical: 14,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                textStyle: const TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildDefaultCover() => Container(
    decoration: const BoxDecoration(
      gradient: LinearGradient(
        colors: [Color(0xFF1E3A5F), Color(0xFF3B82F6)],
        begin: AlignmentDirectional.topStart,
        end: AlignmentDirectional.bottomEnd,
      ),
    ),
  );

  Color _roleColor(UserRole role) {
    switch (role) {
      case UserRole.wholesaler:
        return const Color(0xFF7C3AED);
      case UserRole.shipper:
        return const Color(0xFF0EA5E9);
      case UserRole.retailer:
        return const Color(0xFF059669);
    }
  }

  Widget _sectionTitle(BuildContext context, String text) {
    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 8),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: const Color(0xFF64748B),
          letterSpacing: AppDirectionality.localizedLetterSpacing(context, 0.8),
        ),
      ),
    );
  }

  Widget _infoCard(List<Widget> children) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x08000000),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Column(children: children),
    );
  }

  Widget _infoRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Icon(icon, size: 20, color: const Color(0xFF64748B)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 11,
                    color: Color(0xFF94A3B8),
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 14,
                    color: Color(0xFF0F172A),
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
