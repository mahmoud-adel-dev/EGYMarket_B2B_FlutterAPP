import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { withAuth, RouteContext } from '@/lib/auth/withAuth';
import Organization from '@/models/Organization';
import User from '@/models/User';

const PayloadSchema = z.object({
  accounts: z.array(
    z.object({
      method: z.enum(['instapay', 'mobile_wallet', 'bank_transfer', 'cash']),
      label: z.string().trim().min(2).max(120),
      account_holder: z.string().trim().min(2).max(160),
      account_reference: z.string().trim().min(3).max(200),
      instructions: z.string().trim().max(1000).optional(),
      is_active: z.boolean().default(true),
    })
  ).max(10),
});

async function paramId(context: RouteContext) {
  const params = context.params ? await context.params : {};
  const value = params.id;
  return Array.isArray(value) ? value[0] : value || '';
}

async function resolveOrganization(userId: string) {
  const user = await User.findById(userId).select('organization_id');
  return user?.organization_id ? Organization.findById(user.organization_id) : null;
}

export const GET = withAuth([], async (req, context, session) => {
  const targetUserId = await paramId(context);
  if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
    return NextResponse.json({ error: 'Bad Request', message: 'Invalid user id' }, { status: 400 });
  }
  if (targetUserId !== session.user.id && session.user.role !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden', message: 'Access denied' }, { status: 403 });
  }
  const organization = await resolveOrganization(targetUserId);
  return NextResponse.json({ success: true, accounts: organization?.payment_accounts || [] });
});

export const PUT = withAuth([], async (req: NextRequest, context, session) => {
  const targetUserId = await paramId(context);
  if (targetUserId !== session.user.id && session.user.role !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden', message: 'Access denied' }, { status: 403 });
  }
  if (session.user.role !== 'Admin' && !['owner', 'manager'].includes(session.user.organizationMemberRole || '')) {
    return NextResponse.json({ error: 'Forbidden', message: 'Owner or manager access required' }, { status: 403 });
  }
  const { accounts } = PayloadSchema.parse(await req.json());
  const organization = await resolveOrganization(targetUserId);
  if (!organization) {
    return NextResponse.json({ error: 'Not Found', message: 'Organization not found' }, { status: 404 });
  }
  organization.payment_accounts = accounts;
  await organization.save();
  return NextResponse.json({ success: true, message: 'Local payment accounts updated', accounts });
});
