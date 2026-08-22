import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import Organization from '@/models/Organization';

const DocumentSchema = z.object({
  type: z.enum(['commercial_register', 'tax_card', 'national_id', 'shipping_license', 'other']),
  file_url: z.string().url(),
});
const SubmitSchema = z.object({ documents: z.array(DocumentSchema).min(1).max(10) });

export const POST = withAuth([], async (req: NextRequest, context, session) => {
  if (!['owner', 'manager'].includes(session.user.organizationMemberRole || '')) {
    return NextResponse.json({ error: 'Forbidden', message: 'Owner or manager access required' }, { status: 403 });
  }
  const { documents } = SubmitSchema.parse(await req.json());
  const organization = await Organization.findById(session.user.organizationId);
  if (!organization) {
    return NextResponse.json({ error: 'Not Found', message: 'Organization not found' }, { status: 404 });
  }
  if (organization.verification_status === 'verified') {
    return NextResponse.json({ error: 'Conflict', message: 'Organization is already verified' }, { status: 409 });
  }
  organization.verification_documents = documents.map((document) => ({
    ...document,
    status: 'pending' as const,
    uploaded_at: new Date(),
  }));
  organization.verification_status = 'pending';
  await organization.save();
  return NextResponse.json({ success: true, message: 'Verification submitted', verification_status: organization.verification_status });
});
