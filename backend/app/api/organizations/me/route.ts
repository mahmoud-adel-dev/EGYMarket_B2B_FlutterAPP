import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import Organization from '@/models/Organization';
import User from '@/models/User';

const UpdateOrganizationSchema = z.object({
  display_name: z.string().trim().min(2).max(160).optional(),
  legal_name: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(3000).optional(),
  phone: z.string().trim().min(8).max(30).optional(),
  email: z.string().email().optional(),
  location: z
    .object({
      governorate: z.string().trim().min(2).max(80),
      address: z.string().trim().max(500).optional(),
    })
    .optional(),
  tax_number: z.string().trim().max(100).optional(),
  commercial_register_number: z.string().trim().max(100).optional(),
  avatar_url: z.string().url().optional().or(z.literal('')),
  cover_url: z.string().url().optional().or(z.literal('')),
});

export const GET = withAuth([], async (req, context, session) => {
  if (!session.user.organizationId) {
    return NextResponse.json({ success: true, organization: null });
  }
  const organization = await Organization.findById(session.user.organizationId).lean();
  return NextResponse.json({ success: true, organization });
});

export const PATCH = withAuth([], async (req: NextRequest, context, session) => {
  if (!session.user.organizationId) {
    return NextResponse.json({ error: 'Bad Request', message: 'Organization is required' }, { status: 400 });
  }
  if (!['owner', 'manager'].includes(session.user.organizationMemberRole || '')) {
    return NextResponse.json({ error: 'Forbidden', message: 'Owner or manager access required' }, { status: 403 });
  }
  const data = UpdateOrganizationSchema.parse(await req.json());
  const organization = await Organization.findByIdAndUpdate(
    session.user.organizationId,
    { $set: data },
    { new: true, runValidators: true }
  );
  if (data.display_name) {
    await User.findByIdAndUpdate(session.user.id, { business_name: data.display_name });
  }
  return NextResponse.json({ success: true, message: 'Organization updated', organization });
});
