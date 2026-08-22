import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import User from '@/models/User';
import { parsePagination } from '@/lib/api/pagination';

export const GET = withAuth(['Admin'], async (req: NextRequest) => {
  const params = new URL(req.url).searchParams;
  const { page, limit, skip } = parsePagination(params);
  const filter: Record<string, unknown> = {};
  if (params.get('role')) filter.role = params.get('role');
  if (params.get('active')) filter.isActive = params.get('active') === 'true';
  const [users, total] = await Promise.all([
    User.find(filter)
      .select('name email phone role isActive organization_id createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);
  return NextResponse.json({ success: true, users, pagination: { page, limit, total } });
});
