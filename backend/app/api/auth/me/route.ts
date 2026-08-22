import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import User from '@/models/User';
import Organization from '@/models/Organization';
import OrganizationMember from '@/models/OrganizationMember';
import Subscription from '@/models/Subscription';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/me
 * Protected endpoint: Returns the server-authoritative profile for the authenticated user.
 */
export const GET = withAuth([], async (req: NextRequest, context, session) => {
  try {
    const user = await User.findById(session.user.id);
    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'User account not found or disabled' },
        { status: 401 }
      );
    }

    const [organization, membership, subscription] = session.user.organizationId
      ? await Promise.all([
          Organization.findById(session.user.organizationId).lean(),
          OrganizationMember.findOne({
            organization_id: session.user.organizationId,
            user_id: user._id,
            status: 'active',
          }).lean(),
          Subscription.findOne({ organization_id: session.user.organizationId }).sort({ createdAt: -1 }).lean(),
        ])
      : [null, null, null];

    return NextResponse.json({
      success: true,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        location: user.location,
        role: user.role,
        organization_id: session.user.organizationId,
        organization_member_role: membership?.role,
        organization,
        subscription,
        createdAt: user.createdAt,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected server error occurred' },
      { status: 500 }
    );
  }
});
