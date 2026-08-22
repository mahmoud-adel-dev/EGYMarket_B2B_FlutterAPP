import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db/mongoose';
import Organization from '@/models/Organization';
import { parsePagination } from '@/lib/api/pagination';

export async function GET(req: NextRequest) {
  await connectToDatabase();
  const params = new URL(req.url).searchParams;
  const { page, limit, skip } = parsePagination(params);
  const effectiveLimit = Math.min(limit, 50);
const querySkip = (page - 1) * effectiveLimit;
  const filter: Record<string, unknown> = {
    is_active: true,
    verification_status: 'verified',
  };
  const type = params.get('type');
  const governorate = params.get('governorate');
  const q = params.get('q');
  if (['wholesaler', 'buyer', 'shipper'].includes(type || '')) filter.type = type;
  if (governorate) filter['location.governorate'] = governorate;
  if (q) filter.$text = { $search: q };

  const [organizations, total] = await Promise.all([
    Organization.find(filter)
      .select('-payment_accounts -verification_documents -tax_number -commercial_register_number')
      .sort({ createdAt: -1 })
      .skip(querySkip)
      .limit(effectiveLimit)
      .lean(),
    Organization.countDocuments(filter),
  ]);
  return NextResponse.json({
    success: true,
    organizations,
    pagination: { page, limit: effectiveLimit, total, total_pages: Math.ceil(total / effectiveLimit) },
  });
}
