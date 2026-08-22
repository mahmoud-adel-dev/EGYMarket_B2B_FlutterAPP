import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import PlatformSettings, { getPlatformSettings } from '@/models/PlatformSettings';

const SettingsSchema = z.object({
  order_fee_piasters: z.number().int().nonnegative().optional(),
  trial_days: z.number().int().min(0).max(90).optional(),
  subscription_grace_days: z.number().int().min(0).max(30).optional(),
  payment_deadline_hours: z.number().int().min(1).max(720).optional(),
  platform_payment_accounts: z
    .array(
      z.object({
        method: z.enum(['instapay', 'mobile_wallet', 'bank_transfer']),
        label: z.string().trim().min(2).max(120),
        account_holder: z.string().trim().min(2).max(160),
        account_reference: z.string().trim().min(3).max(200),
        instructions: z.string().trim().max(1000).optional(),
        is_active: z.boolean().default(true),
      })
    )
    .max(10)
    .optional(),
  support_phone: z.string().trim().max(30).optional(),
  support_email: z.string().email().optional(),
});

export const GET = withAuth(['Admin'], async () => {
  const settings = await getPlatformSettings();
  return NextResponse.json({ success: true, settings });
});

export const PATCH = withAuth(['Admin'], async (req: NextRequest) => {
  const data = SettingsSchema.parse(await req.json());
  const settings = await PlatformSettings.findOneAndUpdate(
    { key: 'default' },
    { $set: data, $setOnInsert: { key: 'default' } },
    { upsert: true, new: true, runValidators: true }
  );
  return NextResponse.json({ success: true, settings });
});
