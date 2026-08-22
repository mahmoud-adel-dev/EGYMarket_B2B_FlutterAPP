import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getOrderAttentionSummary } from '@/lib/orders/order_attention_service';

export const dynamic = 'force-dynamic';

export const GET = withAuth([], async (_req, _context, session) => {
  const attention = await getOrderAttentionSummary(session);
  return NextResponse.json(
    { success: true, attention },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    }
  );
});
