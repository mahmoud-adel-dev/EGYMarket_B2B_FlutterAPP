import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:seals_app/core/utils/media_upload_payload.dart';
import 'package:seals_app/core/utils/price_formatter.dart';

Uint8List bytesOf(List<int> values) => Uint8List.fromList(values);

void main() {
  group('PriceFormatter', () {
    test('formats piasters as EGP with two decimals', () {
      // 123450 piasters = 1234.50 EGP
      final out = PriceFormatter.egp(123450);
      expect(out, contains('1,234.50'));
      expect(
        out.contains(r'$'),
        isFalse,
        reason: 'regression guard: prices must never render as dollars',
      );
      expect(out.contains('ج.م'), isTrue);
    });

    test('handles zero and sub-piaster rounding deterministically', () {
      expect(PriceFormatter.egp(0), contains('0.00'));
      expect(PriceFormatter.egp(99), contains('0.99'));
    });
  });

  group('media upload payload validation', () {
    test('rejects oversized images before encoding', () {
      final bytes = bytesOf(List<int>.filled(kMaxImageBytes + 1, 0x89));
      expect(
        () => payloadFromBytes(bytes, 'image/png', 'image'),
        throwsA(isA<MediaUploadException>()),
      );
    });

    test('rejects disallowed mime types (server allow-list parity)', () {
      expect(
        () => payloadFromBytes(bytesOf([0x00]), 'application/pdf', 'image'),
        throwsA(isA<MediaUploadException>()),
      );
      expect(
        () => payloadFromBytes(bytesOf([0x00]), 'video/avi', 'video'),
        throwsA(isA<MediaUploadException>()),
      );
    });

    test('accepts a valid small png payload and builds a data URL', () {
      const pngMagic = [0x89, 0x50, 0x4e, 0x47];
      final payload = payloadFromBytes(bytesOf(pngMagic), 'image/png', 'image');
      expect(payload.mimeType, 'image/png');
      expect(payload.fileType, 'image');
      expect(payload.dataUrl.startsWith('data:image/png;base64,'), isTrue);
    });

    test('request body carries the exact server contract fields', () {
      final payload = payloadFromBytes(
        bytesOf([0xff, 0xd8, 0xff]),
        'image/jpeg',
        'image',
      );
      final body = payload.toRequestBody();
      expect(body.keys.toSet(), {'fileData', 'fileType', 'mimeType'});
    });
  });
}
