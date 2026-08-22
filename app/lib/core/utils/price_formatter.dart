import 'package:intl/intl.dart';

/// Server money values are integer piasters (1 EGP = 100 piasters). All client
/// formatting funnels through here so currency display is consistent and the
/// dollar-sign bug (e.g. "$12.34") cannot reappear.
abstract final class PriceFormatter {
  static final NumberFormat _egp = NumberFormat.currency(
    locale: 'en_US',
    symbol: 'ج.م ',
    decimalDigits: 2,
  );

  static final NumberFormat _compact = NumberFormat.compact(locale: 'en_US');

  /// Formats an amount given in piasters, e.g. 123450 → "ج.م 1,234.50".
  static String egp(num piasters) => _egp.format(piasters / 100);

  /// Compact form for dashboards/charts: 1250000 → "12.5K" (still piasters in).
  static String compactPiasters(num piasters) {
    final egpValue = piasters / 100;
    if (egpValue.abs() >= 1000) return '${_compact.format(egpValue)} ج.م';
    return egp(piasters);
  }
}
