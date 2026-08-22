import { describe, expect, it } from 'vitest';
import { RegisterSchema } from '../lib/validation/auth';
import { CreateOrderSchema, TrackingEventSchema } from '../lib/validation/order';
import { SubmitPaymentProofSchema } from '../lib/validation/payment';
import { CreateProductSchema } from '../lib/validation/product';

const objectId = '507f1f77bcf86cd799439011';

describe('public input validation', () => {
  it('requires strong passwords and explicit legal acceptance', () => {
    const input = {
      name: 'Buyer Owner',
      email: 'OWNER@EXAMPLE.COM',
      phone: '01000000000',
      password: 'secure123',
      business_name: 'Buyer Company',
      location: { governorate: 'Cairo' },
      role: 'retailer',
      accepted_terms: true,
    } as const;
    const parsed = RegisterSchema.parse(input);
    expect(parsed.role).toBe('Retailer');
    expect(RegisterSchema.safeParse({ ...input, password: '12345678' }).success).toBe(false);
    expect(RegisterSchema.safeParse({ ...input, accepted_terms: false }).success).toBe(false);
  });

  it('requires a shipping rate and address together for third-party delivery', () => {
    const items = [{ product_id: objectId, quantity: 10 }];
    expect(CreateOrderSchema.safeParse({ items, fulfillment_method: 'third_party_shipping' }).success).toBe(false);
    expect(CreateOrderSchema.safeParse({
      items,
      fulfillment_method: 'third_party_shipping',
      shipping_rate_id: objectId,
      shipping_address: {
        governorate: 'Cairo',
        address: 'Nasr City, Cairo',
        contact_name: 'Receiver Name',
        phone: '01000000000',
      },
    }).success).toBe(true);
  });

  it('rejects client prices and invalid proof URLs by schema design', () => {
    const product = CreateProductSchema.parse({
      title: 'Wholesale product',
      description: 'A server-priced wholesale product',
      price_piasters: 10_000,
      moq: 10,
      images: ['https://cdn.example.com/product.jpg'],
      category: 'food',
      stock_quantity: 100,
    });
    expect('client_total' in product).toBe(false);
    expect(SubmitPaymentProofSchema.safeParse({
      payment_method: 'instapay',
      sender_reference: 'ABC123',
      proof_url: 'not-a-url',
    }).success).toBe(false);
  });

  it('rejects duplicate or increasing wholesale price tiers', () => {
    const base = {
      title: 'Wholesale product',
      description: 'A product with tier validation',
      price_piasters: 10_000,
      moq: 10,
      images: ['https://cdn.example.com/product.jpg'],
      category: 'food',
      stock_quantity: 100,
    };
    expect(CreateProductSchema.safeParse({
      ...base,
      price_tiers: [
        { min_quantity: 50, unit_price_piasters: 9_000 },
        { min_quantity: 50, unit_price_piasters: 8_500 },
      ],
    }).success).toBe(false);
    expect(CreateProductSchema.safeParse({
      ...base,
      price_tiers: [
        { min_quantity: 50, unit_price_piasters: 9_000 },
        { min_quantity: 100, unit_price_piasters: 9_500 },
      ],
    }).success).toBe(false);
  });

  it('validates bounded shipping checkpoints', () => {
    expect(TrackingEventSchema.safeParse({
      event_type: 'checkpoint',
      location: 'Cairo sorting hub',
      note: 'Departed for Beheira',
    }).success).toBe(true);
    expect(TrackingEventSchema.safeParse({
      event_type: 'delivered',
      location: 'Cairo',
    }).success).toBe(false);
    expect(TrackingEventSchema.safeParse({
      event_type: 'checkpoint',
      location: '',
    }).success).toBe(false);
  });
});
