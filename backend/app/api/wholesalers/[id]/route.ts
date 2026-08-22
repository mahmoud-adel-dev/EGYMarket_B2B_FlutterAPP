import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import { authOptions } from '@/lib/auth/authOptions';
import connectToDatabase from '@/lib/db/mongoose';
import Organization from '@/models/Organization';
import Product from '@/models/Product';
import Order from '@/models/Order';
import Rating from '@/models/Rating';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Bad Request', message: 'Invalid wholesaler id' }, { status: 400 });
  }
  await connectToDatabase();
  const session = await getServerSession(authOptions);
  const isOwner = session?.user?.organizationId === id;
  const organization = await Organization.findOne({
    _id: id,
    type: 'wholesaler',
    ...(isOwner ? {} : { verification_status: 'verified' }),
    is_active: true,
  }).lean();
  if (!organization) return NextResponse.json({ error: 'Not Found', message: 'Wholesaler not found' }, { status: 404 });
  const [totalProducts, totalOrders, ratings] = await Promise.all([
    Product.countDocuments({ organization_id: id, status: 'active', isActive: true }),
    Order.countDocuments({ seller_organization_id: id, status: 'completed' }),
    Rating.aggregate([
      { $match: { target_id: organization._id, target_type: 'wholesaler' } },
      { $group: { _id: null, average: { $avg: '$rating' } } },
    ]),
  ]);
  return NextResponse.json({
    success: true,
    wholesaler: {
      id: organization._id.toString(),
      business_name: organization.display_name,
      business_description: organization.description || '',
      avatar_url: organization.avatar_url || '',
      cover_url: organization.cover_url || '',
      location: organization.location,
      totalProducts,
      totalOrders,
      rating: ratings[0]?.average || 0,
      isVerified: organization.verification_status === 'verified',
      verificationStatus: organization.verification_status,
      category: 'تجارة الجملة',
    },
  });
}
