import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parsePagination } from '@/lib/api/pagination';
import AuditLog from '@/models/AuditLog';

export const dynamic = 'force-dynamic';

export const GET = withAuth(['Admin'], async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const { page, limit, skip } = parsePagination(searchParams);

  const action = searchParams.get('action')?.trim();
  const entityType = searchParams.get('entity_type')?.trim();

  const filter: Record<string, unknown> = {};
  if (action) filter.action = action;
  if (entityType) filter.entity_type = entityType;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('actor_user_id', 'name email')
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  return NextResponse.json({
    success: true,
    logs,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  });
});
