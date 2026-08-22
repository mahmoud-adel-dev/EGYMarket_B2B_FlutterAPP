import { z } from 'zod';

const ProductFields = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  price_piasters: z.number().int().positive('Price must be greater than 0'),
  price_tiers: z
    .array(
      z.object({
        min_quantity: z.number().int().min(1),
        unit_price_piasters: z.number().int().positive(),
      })
    )
    .max(10)
    .default([]),
  moq: z.number().int().min(1, 'MOQ must be at least 1').default(1),
  images: z.array(z.string().url('Invalid image URL')).min(1, 'At least one image is required'),
  video_urls: z.array(z.string().url('Invalid video URL')).max(8).optional().default([]),
  category: z.string().min(2, 'Category is required'),
  tags: z.array(z.string()).optional().default([]),
  sku: z.string().trim().min(1).max(80).optional(),
  stock_quantity: z.number().int().nonnegative(),
  unit: z.string().trim().min(1).max(40).default('قطعة'),
  sale_type: z.enum(['piece', 'pack', 'carton', 'pallet']).default('piece'),
  units_per_sale: z.number().int().min(1).max(100000).default(1),
  cost_price_piasters: z.number().int().nonnegative().default(0),
  discount_percent: z.number().min(0).max(95).default(0),
  lead_time_days: z.number().int().min(0).max(365).default(1),
  return_policy: z.string().trim().max(1000).optional().default(''),
  specifications: z.record(z.string().trim().min(1).max(120), z.string().trim().min(1).max(500)).optional().default({}),
  faqs: z.array(z.object({
    question: z.string().trim().min(3).max(300),
    answer: z.string().trim().min(3).max(1000),
  })).max(20).optional().default([]),
  publish: z.boolean().default(false),
});

function validatePriceTiers(
  data: { price_piasters?: number; price_tiers?: Array<{ min_quantity: number; unit_price_piasters: number }> },
  ctx: z.RefinementCtx
) {
  const tiers = [...(data.price_tiers || [])].sort((a, b) => a.min_quantity - b.min_quantity);
  const quantities = new Set<number>();
  for (let index = 0; index < tiers.length; index += 1) {
    const tier = tiers[index];
    if (quantities.has(tier.min_quantity)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['price_tiers'], message: 'Tier quantities must be unique' });
    }
    quantities.add(tier.min_quantity);
    const previousPrice = index === 0 ? data.price_piasters : tiers[index - 1].unit_price_piasters;
    if (previousPrice !== undefined && tier.unit_price_piasters > previousPrice) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['price_tiers'],
        message: 'Unit price cannot increase at a higher quantity tier',
      });
    }
  }
}

export const CreateProductSchema = ProductFields.superRefine(validatePriceTiers);
export const UpdateProductSchema = ProductFields.partial().superRefine(validatePriceTiers);

export const ProductQuerySchema = z.object({
  category: z.string().optional(),
  tags: z.string().optional(), // Comma-separated tags e.g. "electronics,mobile"
  governorate: z.string().optional(),
  q: z.string().optional(), // Search keyword
  min_price: z.coerce.number().nonnegative().optional(),
  max_price: z.coerce.number().nonnegative().optional(),
  min_stock: z.coerce.number().int().nonnegative().optional(),
  sale_type: z.enum(['piece', 'pack', 'carton', 'pallet']).optional(),
  sort: z.enum(['relevance', 'newest', 'price_asc', 'price_desc', 'stock_desc']).default('relevance'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type ProductQueryInput = z.infer<typeof ProductQuerySchema>;
