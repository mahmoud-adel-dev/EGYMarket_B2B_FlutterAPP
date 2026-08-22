import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import Organization from '@/models/Organization';
import Subscription from '@/models/Subscription';
import User from '@/models/User';

const ProfileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  phone: z.string().trim().min(8).max(30).optional(),
  avatar_url: z.string().url().or(z.literal('')).optional(),
  cover_url: z.string().url().or(z.literal('')).optional(),
  business_name: z.string().trim().min(2).max(160).optional(),
  business_description: z.string().trim().max(3000).optional(),
  location: z.object({
    governorate: z.string().trim().min(2).max(80),
    address: z.string().trim().max(500).optional(),
  }).optional(),
  contact_methods: z.object({
    phone: z.string().trim().min(8).max(30).optional(),
    whatsapp: z.string().trim().min(8).max(30).optional(),
    email: z.string().email().optional(),
  }).optional(),
});

function serializeProfile(user: any, organization: any, subscription: any) {
  const accounts = organization?.payment_accounts || [];
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    avatar_url: organization?.avatar_url || user.avatar_url,
    cover_url: organization?.cover_url,
    business_name: organization?.display_name || user.business_name || user.name,
    business_description: organization?.description,
    location: organization?.location || user.location,
    contact_methods: {
      phone: organization?.phone || user.phone,
      whatsapp: organization?.phone || user.phone,
      email: organization?.email || user.email,
    },
    paymentSettings: {
      accepted_methods: [...new Set(accounts.filter((item: any) => item.is_active).map((item: any) => item.method))],
    },
    subscription: subscription ? {
      status: subscription.status,
      starts_at: subscription.starts_at,
      current_period_ends_at: subscription.current_period_ends_at,
      grace_ends_at: subscription.grace_ends_at,
    } : null,
    organization_id: organization?._id.toString(),
    organization_type: organization?.type,
    verification_status: organization?.verification_status,
    createdAt: user.createdAt,
  };
}

export const GET = withAuth([], async (req, context, session) => {
  const [user, organization, subscription] = await Promise.all([
    User.findById(session.user.id),
    session.user.organizationId ? Organization.findById(session.user.organizationId) : null,
    session.user.organizationId
      ? Subscription.findOne({ organization_id: session.user.organizationId }).sort({ createdAt: -1 })
      : null,
  ]);
  if (!user) return NextResponse.json({ error: 'Not Found', message: 'User not found' }, { status: 404 });
  return NextResponse.json({ success: true, user: serializeProfile(user, organization, subscription) });
});

export const PUT = withAuth([], async (req: NextRequest, context, session) => {
  const data = ProfileUpdateSchema.parse(await req.json());
  const user = await User.findById(session.user.id);
  if (!user) return NextResponse.json({ error: 'Not Found', message: 'User not found' }, { status: 404 });

  if (data.name !== undefined) user.name = data.name;
  if (data.phone !== undefined) user.phone = data.phone;
  if (data.avatar_url !== undefined) user.avatar_url = data.avatar_url;
  if (data.location !== undefined) user.location = data.location;
  await user.save();

  let organization = session.user.organizationId
    ? await Organization.findById(session.user.organizationId)
    : null;
  const canManageOrganization = ['owner', 'manager'].includes(session.user.organizationMemberRole || '');
  if (organization && canManageOrganization) {
    if (data.business_name !== undefined) organization.display_name = data.business_name;
    if (data.business_description !== undefined) organization.description = data.business_description;
    if (data.avatar_url !== undefined) organization.avatar_url = data.avatar_url;
    if (data.cover_url !== undefined) organization.cover_url = data.cover_url;
    if (data.location !== undefined) organization.location = data.location;
    if (data.contact_methods?.phone !== undefined) organization.phone = data.contact_methods.phone;
    if (data.contact_methods?.email !== undefined) organization.email = data.contact_methods.email;
    await organization.save();
  }

  const subscription = organization
    ? await Subscription.findOne({ organization_id: organization._id }).sort({ createdAt: -1 })
    : null;
  return NextResponse.json({
    success: true,
    message: 'Profile updated successfully',
    user: serializeProfile(user, organization, subscription),
  });
});
