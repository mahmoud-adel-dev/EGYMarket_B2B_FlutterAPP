import 'package:flutter_test/flutter_test.dart';
import 'package:seals_app/core/constants/governorates.dart';
import 'package:seals_app/features/auth/presentation/screens/register_screen.dart';

void main() {
  group('governorate single source of truth', () {
    test('contains exactly 27 unique Egyptian governorates', () {
      expect(egyptGovernorates.length, 27);
      expect(egyptGovernorates.toSet().length, 27);
    });

    test('register screen aliases the canonical list (no divergent copy)', () {
      expect(identical(kEgyptianGovernorates, egyptGovernorates), isTrue);
    });

    test('uses Arabic names that match server-side seed/filter data', () {
      // The feed/shipping filters compare against Arabic governorate strings;
      // a regression to English names silently breaks discovery + shipping.
      expect(egyptGovernorates, contains('القاهرة'));
      expect(
        egyptGovernorates.any((g) => RegExp(r'^[A-Za-z ]+$').hasMatch(g)),
        isFalse,
      );
    });
  });
}
