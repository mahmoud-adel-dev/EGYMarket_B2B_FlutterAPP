import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import SubscriptionPlan from '@/models/SubscriptionPlan';

const PlanSchema = z.object({
  code: z.string().trim().min(2).max(50).regex(/^[a-z0-9_-]+$/),
  name_ar: z.string().trim().min(2).max(120),
  name_en: z.string().trim().min(2).max(120),
  description_ar: z.string().trim().max(1000).optional(),
  price_piasters: z.number().int().nonnegative(),
  billing_interval: z.enum(['monthly', 'yearly']),
  organization_types: z.array(z.enum(['wholesaler', 'buyer', 'shipper'])).min(1),
  features: z.array(z.string().trim().min(1).max(120)).default([]),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const GET = withAuth(['Admin'], async () => {
  const plans = await SubscriptionPlan.find().sort({ sort_order: 1, createdAt: -1 }).lean();
  return NextResponse.json({ success: true, plans });
});

export const POST = withAuth(['Admin'], async (req: NextRequest) => {
  const data = PlanSchema.parse(await req.json());
  const plan = await SubscriptionPlan.create(data);
  return NextResponse.json({ success: true, plan }, { status: 201 });
});
