import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import Follow from '@/models/Follow';
import Organization from '@/models/Organization';
import { createOrganizationNotification } from '@/lib/notifications/notification_service';
import { parsePagination } from '@/lib/api/pagination';

const FollowSchema = z.object({ wholesaler_organization_id: z.string().refine(mongoose.Types.ObjectId.isValid) });

export const GET = withAuth(['Retailer'], async (req, context, session) => {
  const { limit, skip } = parsePagination(new URL(req.url).searchParams);
  const effectiveLimit = Math.min(limit, 100);
  const follows = await Follow.find({ follower_organization_id: session.user.organizationId })
    .populate('wholesaler_organization_id', 'display_name avatar_url cover_url location verification_status')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(effectiveLimit)
    .lean();
  return NextResponse.json({ success: true, follows });
});

export const POST = withAuth(['Retailer'], async (req, context, session) => {
  const data = FollowSchema.parse(await req.json());
  const wholesaler = await Organization.findOne({
    _id: data.wholesaler_organization_id,
    type: 'wholesaler',
    verification_status: 'verified',
    is_active: true,
  });
  if (!wholesaler) {
    return NextResponse.json({ error: 'Not Found', message: 'Wholesaler not found' }, { status: 404 });
  }
  const existed = await Follow.exists({
    follower_organization_id: session.user.organizationId,
    wholesaler_organization_id: wholesaler._id,
  });
  const follow = await Follow.findOneAndUpdate(
    {
      follower_organization_id: session.user.organizationId,
      wholesaler_organization_id: wholesaler._id,
    },
    { $setOnInsert: { createdAt: new Date() } },
    { upsert: true, new: true }
  );
  if (!existed) {
    await createOrganizationNotification(wholesaler._id, {
      type: 'follow_received',
      title: 'متابع جديد',
      body: `${session.user.name || 'مشتري'} بدأ متابعة متجرك.`,
      metadata: { actorUserId: session.user.id, actorOrganizationId: session.user.organizationId },
    });
  }
  return NextResponse.json({ success: true, follow }, { status: existed ? 200 : 201 });
});

export const DELETE = withAuth(['Retailer'], async (req: NextRequest, context, session) => {
  const data = FollowSchema.parse({
    wholesaler_organization_id: new URL(req.url).searchParams.get('wholesaler_organization_id'),
  });
  await Follow.deleteOne({
    follower_organization_id: session.user.organizationId,
    wholesaler_organization_id: data.wholesaler_organization_id,
  });
  return NextResponse.json({ success: true });
});
