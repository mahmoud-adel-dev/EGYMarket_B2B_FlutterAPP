import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getPlatformSettings } from '@/models/PlatformSettings';

export const GET = withAuth([], async () => {
  const settings = await getPlatformSettings();
  return NextResponse.json({
    success: true,
    order_fee_piasters: settings.order_fee_piasters,
    currency: 'EGP',
    accounts: settings.platform_payment_accounts.filter((account) => account.is_active),
  });
});
