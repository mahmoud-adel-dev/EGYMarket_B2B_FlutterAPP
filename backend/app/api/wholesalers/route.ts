import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db/mongoose';
import Organization from '@/models/Organization';
import Product from '@/models/Product';
import Rating from '@/models/Rating';
import { parsePagination } from '@/lib/api/pagination';
import { escapeRegExp } from '@/lib/utils/regexp';

export async function GET(req: NextRequest) {
  await connectToDatabase();
  const params = new URL(req.url).searchParams;
  const { page, limit, skip } = parsePagination(params);
  const effectiveLimit = Math.min(limit, 50);
const querySkip = (page - 1) * effectiveLimit;
  const filter: Record<string, unknown> = {
    type: 'wholesaler',
    verification_status: 'verified',
    is_active: true,
  };
  if (params.get('governorate')) filter['location.governorate'] = params.get('governorate');
  const q = params.get('q')?.trim();
  if (q) {
    const regex = new RegExp(escapeRegExp(q), 'i');
    filter.$or = [
      { display_name: regex },
      { legal_name: regex },
      { description: regex },
    ];
  }
  const [organizations, total] = await Promise.all([
    Organization.find(filter).sort({ createdAt: -1 }).skip(querySkip).limit(effectiveLimit).lean(),
    Organization.countDocuments(filter),
  ]);
  const wholesalers = await Promise.all(organizations.map(async (organization) => {
    const [totalProducts, stats] = await Promise.all([
      Product.countDocuments({ organization_id: organization._id, status: 'active', isActive: true }),
      Rating.aggregate([
        { $match: { target_id: organization._id, target_type: 'wholesaler' } },
        { $group: { _id: null, average: { $avg: '$rating' } } },
      ]),
    ]);
    return {
      id: organization._id.toString(),
      name: organization.display_name,
      business_name: organization.display_name,
      business_description: organization.description || '',
      avatar_url: organization.avatar_url || '',
      cover_url: organization.cover_url || '',
      location: organization.location,
      rating: stats[0]?.average || 0,
      isVerified: true,
      category: 'تجارة الجملة',
      totalProducts,
    };
  }));
  return NextResponse.json({
    success: true,
    wholesalers,
    pagination: { total, page, limit: effectiveLimit, totalPages: Math.ceil(total / effectiveLimit) },
  });
}
