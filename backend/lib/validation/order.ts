import { z } from 'zod';

const ObjectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const CreateOrderSchema = z
  .object({
    items: z.array(z.object({ product_id: ObjectId, quantity: z.number().int().positive() })).min(1).max(100),
    fulfillment_method: z.enum(['buyer_pickup', 'third_party_shipping']),
    shipping_rate_id: ObjectId.optional(),
    shipping_address: z
      .object({
        governorate: z.string().trim().min(2).max(80),
        address: z.string().trim().min(5).max(500),
        contact_name: z.string().trim().min(2).max(120),
        phone: z.string().trim().min(8).max(30),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.fulfillment_method === 'third_party_shipping' && (!data.shipping_rate_id || !data.shipping_address)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Shipping rate and address are required for delivery' });
    }
    if (data.fulfillment_method === 'buyer_pickup' && data.shipping_rate_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Shipping rate is not valid for buyer pickup' });
    }
  });

export const OrderActionSchema = z.object({
  action: z.enum([
    'accept',
    'reject',
    'mark_ready',
    'confirm_pickup',
    'confirm_delivery',
    'confirm_receipt',
    'cancel',
    'open_dispute',
    'resolve_dispute_complete',
    'resolve_dispute_cancel',
  ]),
  note: z.string().trim().max(1000).optional(),
});

export const TrackingEventSchema = z.object({
  event_type: z.enum(['checkpoint', 'out_for_delivery', 'delivery_attempt', 'exception']),
  location: z.string().trim().min(2).max(160),
  note: z.string().trim().max(1000).optional(),
  occurred_at: z.string().datetime({ offset: true }).optional(),
  client_event_id: z.string().trim().min(8).max(100).optional(),
});
