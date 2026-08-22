import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import Organization from '@/models/Organization';
import { writeAuditLog } from '@/lib/audit/audit';

const ReviewSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve') }),
  z.object({ decision: z.literal('reject'), rejection_reason: z.string().trim().min(3).max(500) }),
  z.object({ decision: z.literal('suspend'), rejection_reason: z.string().trim().min(3).max(500) }),
]);

export const POST = withAuth(['Admin'], async (req: NextRequest, context, session) => {
  const params = await context.params;
  const id = params?.id as string;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Bad Request', message: 'Invalid organization id' }, { status: 400 });
  }
  const data = ReviewSchema.parse(await req.json());
  const organization = await Organization.findById(id);
  if (!organization) {
    return NextResponse.json({ error: 'Not Found', message: 'Organization not found' }, { status: 404 });
  }
  const now = new Date();
  const approved = data.decision === 'approve';
  organization.verification_status = approved ? 'verified' : data.decision === 'suspend' ? 'suspended' : 'rejected';
  organization.verification_documents.forEach((document) => {
    document.status = approved ? 'approved' : 'rejected';
    document.reviewed_at = now;
    document.reviewed_by = new mongoose.Types.ObjectId(session.user.id);
    document.rejection_reason = approved ? undefined : data.rejection_reason;
  });
  await organization.save();

  await writeAuditLog({
    actorUserId: session.user.id,
    action:
      data.decision === 'approve'
        ? 'organization_verified'
        : data.decision === 'suspend'
          ? 'organization_suspended'
          : 'organization_verification_rejected',
    entityType: 'Organization',
    entityId: id,
    metadata: {
      organization: organization.display_name,
      type: organization.type,
      ...(data.decision === 'approve' ? {} : { rejection_reason: data.rejection_reason }),
    },
    ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
    userAgent: req.headers.get('user-agent') ?? undefined,
  });

  return NextResponse.json({ success: true, organization });
});
