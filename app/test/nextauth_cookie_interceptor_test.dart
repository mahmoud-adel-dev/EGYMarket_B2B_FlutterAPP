import 'package:flutter_test/flutter_test.dart';
import 'package:seals_app/core/network/nextauth_cookie_interceptor.dart';

void main() {
  group('NextAuth native cookie handling', () {
    test('captures NextAuth/Auth.js cookies and ignores unrelated cookies', () {
      final cookies = mergeNextAuthCookies({}, [
        'next-auth.session-token=encrypted-session; Path=/; HttpOnly; SameSite=Lax',
        'authjs.csrf-token=csrf-value; Path=/; HttpOnly',
        'analytics_id=must-not-be-stored; Path=/',
      ]);

      expect(cookies['next-auth.session-token'], 'encrypted-session');
      expect(cookies['authjs.csrf-token'], 'csrf-value');
      expect(cookies.containsKey('analytics_id'), isFalse);
    });

    test('removes a session cookie when NextAuth expires it', () {
      final cookies = mergeNextAuthCookies(
        {'__Secure-next-auth.session-token': 'old-session'},
        ['__Secure-next-auth.session-token=; Path=/; Max-Age=0; HttpOnly'],
      );

      expect(cookies, isEmpty);
    });
  });
}
