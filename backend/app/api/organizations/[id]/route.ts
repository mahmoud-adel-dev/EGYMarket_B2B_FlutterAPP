import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '@/lib/db/mongoose';
import Organization from '@/models/Organization';
import Product from '@/models/Product';
import Rating from '@/models/Rating';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Bad Request', message: 'Invalid organization id' }, { status: 400 });
  }
  await connectToDatabase();
  const organization = await Organization.findOne({
    _id: id,
    is_active: true,
    verification_status: 'verified',
  })
    .select('-payment_accounts -verification_documents -tax_number -commercial_register_number')
    .lean();
  if (!organization) {
    return NextResponse.json({ error: 'Not Found', message: 'Organization not found' }, { status: 404 });
  }
  const [productCount, ratingStats] = await Promise.all([
    Product.countDocuments({ organization_id: organization._id, isActive: true }),
    Rating.aggregate([
      { $match: { target_id: organization._id, target_type: 'wholesaler' } },
      { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]),
  ]);
  return NextResponse.json({
    success: true,
    organization: {
      ...organization,
      product_count: productCount,
      rating_average: ratingStats[0]?.average || 0,
      rating_count: ratingStats[0]?.count || 0,
    },
  });
}
