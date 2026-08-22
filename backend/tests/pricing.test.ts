import { describe, expect, it } from 'vitest';
import { unitPriceForQuantity } from '../lib/orders/pricing';

describe('wholesale tier pricing', () => {
  const product = {
    price_piasters: 12_000,
    price_tiers: [
      { min_quantity: 10, unit_price_piasters: 11_000 },
      { min_quantity: 100, unit_price_piasters: 9_500 },
      { min_quantity: 50, unit_price_piasters: 10_000 },
    ],
  };

  it('uses the base server price below the first tier', () => {
    expect(unitPriceForQuantity(product, 9)).toBe(12_000);
  });

  it('uses the highest eligible tier regardless of input order', () => {
    expect(unitPriceForQuantity(product, 75)).toBe(10_000);
    expect(unitPriceForQuantity(product, 150)).toBe(9_500);
  });

  it('converts legacy EGP prices to integer piasters only as a migration fallback', () => {
    expect(unitPriceForQuantity({ price: 42.5 }, 1)).toBe(4_250);
  });
});
