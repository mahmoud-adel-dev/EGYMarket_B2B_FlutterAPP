import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seals_app/core/widgets/error_retry_view.dart';
import 'package:seals_app/core/widgets/media_carousel.dart';

void main() {
  testWidgets('ErrorRetryView shows message and retry action', (tester) async {
    var retried = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ErrorRetryView(
            message: 'تعذر التحميل',
            onRetry: () => retried = true,
          ),
        ),
      ),
    );

    expect(find.text('تعذر التحميل'), findsOneWidget);
    expect(find.byIcon(Icons.refresh_rounded), findsOneWidget);

    await tester.tap(find.byType(FilledButton));
    expect(retried, isTrue);
  });

  testWidgets('ErrorRetryView.empty hides the retry button', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: ErrorRetryView(message: 'لا توجد نتائج', isEmptyState: true),
        ),
      ),
    );
    expect(find.text('لا توجد نتائج'), findsOneWidget);
    expect(find.byType(FilledButton), findsNothing);
  });

  testWidgets('MediaCarousel shows empty placeholder without media', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: MediaCarousel(imageUrls: [])),
      ),
    );
    expect(find.byIcon(Icons.image_outlined), findsOneWidget);
  });

  testWidgets('MediaCarousel renders video-only media with page badge', (
    tester,
  ) async {
    // Video-only avoids CachedNetworkImage network calls, which are blocked
    // (HTTP 400) inside the widget-test binding.
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: MediaCarousel(
            imageUrls: [],
            videoUrls: ['https://cdn.example.test/b.mp4'],
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));
    expect(
      find.text('1/1'),
      findsNothing,
      reason: 'badge hidden for a single item',
    );
    expect(find.byIcon(Icons.play_circle_fill), findsOneWidget);
  });
}
