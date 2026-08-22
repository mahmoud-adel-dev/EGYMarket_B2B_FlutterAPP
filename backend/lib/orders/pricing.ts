export interface QuantityPricedProduct {
  price_piasters?: number;
  price?: number;
  price_tiers?: Array<{
    min_quantity: number;
    unit_price_piasters: number;
  }>;
}

/**
 * Resolves the server-authoritative unit price for a wholesale quantity.
 * The highest eligible tier wins; client-provided prices are never accepted.
 */
export function unitPriceForQuantity(product: QuantityPricedProduct, quantity: number): number {
  const base = product.price_piasters ?? Math.round((product.price || 0) * 100);
  const applicable = [...(product.price_tiers || [])]
    .filter((tier) => tier.min_quantity <= quantity)
    .sort((a, b) => b.min_quantity - a.min_quantity)[0];
  return applicable?.unit_price_piasters ?? base;
}
