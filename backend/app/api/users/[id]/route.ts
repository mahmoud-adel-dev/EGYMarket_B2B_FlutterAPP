import { NextRequest, NextResponse } from 'next/server';
import User from '@/models/User';
import { withAuth, RouteContext } from '@/lib/auth/withAuth';
import { UpdateUserProfileSchema } from '@/lib/validation/user';
import mongoose from 'mongoose';

/**
 * Helper to safely extract single string ID parameter from Next.js App Router context.params
 */
async function getParamId(context: RouteContext): Promise<string> {
  const resolved = context.params ? await context.params : {};
  const idVal = resolved.id;
  return Array.isArray(idVal) ? idVal[0] : idVal || '';
}

/**
 * GET /api/users/[id]
 * Public endpoint to fetch public profiles for Wholesaler or Shipper roles.
 */
export const GET = withAuth([], async (req: NextRequest, context: RouteContext, session) => {
    const userId = await getParamId(context);

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Invalid User ID format' },
        { status: 400 }
      );
    }

    if (session.user.id !== userId && session.user.role !== 'Admin') {
      return NextResponse.json({ error: 'Forbidden', message: 'Access denied' }, { status: 403 });
    }

    const user = await User.findById(userId).select('-passwordHash');

    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: 'Not Found', message: 'User profile not found or inactive' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      profile: {
        id: user._id,
        name: user.name,
        location: user.location,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
});

/**
 * PUT /api/users/[id]
 * Protected endpoint to update user profile.
 * Only the profile owner or an Admin can execute updates.
 */
export const PUT = withAuth([], async (req, context, session) => {
  const targetUserId = await getParamId(context);

  if (!targetUserId || !mongoose.Types.ObjectId.isValid(targetUserId)) {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Invalid User ID format' },
      { status: 400 }
    );
  }

  // Authorization check: User can only update their own profile unless they are an Admin
  const isOwner = session.user.id === targetUserId;
  const isAdmin = session.user.role === 'Admin';

  if (!isOwner && !isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden', message: 'You are only authorized to update your own profile' },
      { status: 403 }
    );
  }

  const body = await req.json();

  // Validate incoming body with Zod
  const validatedData = UpdateUserProfileSchema.parse(body);

  // If not admin, strip out administrative fields like isActive
  if (!isAdmin && validatedData.isActive !== undefined) {
    delete validatedData.isActive;
  }

  const updatedUser = await User.findByIdAndUpdate(
    targetUserId,
    { $set: validatedData },
    { new: true, runValidators: true }
  ).select('-passwordHash');

  if (!updatedUser) {
    return NextResponse.json(
      { error: 'Not Found', message: 'User not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    message: 'Profile updated successfully',
    profile: updatedUser,
  });
});
