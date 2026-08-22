import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import Organization from '@/models/Organization';

const PaymentAccountSchema = z.object({
  method: z.enum(['instapay', 'mobile_wallet', 'bank_transfer', 'cash']),
  label: z.string().trim().min(2).max(120),
  account_holder: z.string().trim().min(2).max(160),
  account_reference: z.string().trim().min(3).max(200),
  instructions: z.string().trim().max(1000).optional(),
  is_active: z.boolean().default(true),
});

const PayloadSchema = z.object({ accounts: z.array(PaymentAccountSchema).max(10) });

export const GET = withAuth([], async (req, context, session) => {
  const organization = await Organization.findById(session.user.organizationId)
    .select('payment_accounts')
    .lean();
  return NextResponse.json({ success: true, accounts: organization?.payment_accounts || [] });
});

export const PUT = withAuth([], async (req: NextRequest, context, session) => {
  if (!['owner', 'manager'].includes(session.user.organizationMemberRole || '')) {
    return NextResponse.json({ error: 'Forbidden', message: 'Owner or manager access required' }, { status: 403 });
  }
  const { accounts } = PayloadSchema.parse(await req.json());
  const organization = await Organization.findByIdAndUpdate(
    session.user.organizationId,
    { $set: { payment_accounts: accounts } },
    { new: true, runValidators: true }
  ).select('payment_accounts');
  return NextResponse.json({ success: true, message: 'Local payment accounts updated', accounts: organization?.payment_accounts || [] });
});
