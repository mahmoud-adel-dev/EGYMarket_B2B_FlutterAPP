import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import Product from '@/models/Product';

export const GET = withAuth(['Wholesaler'], async (req, context, session) => {
  const products = await Product.find({
    organization_id: session.user.organizationId,
    status: { $ne: 'archived' },
  }).select('+cost_price_piasters').sort({ createdAt: -1 }).limit(200).lean();
  return NextResponse.json({ success: true, products, currency: 'EGP' });
});
