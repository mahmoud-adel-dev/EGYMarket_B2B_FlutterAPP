import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db/mongoose';
import Post from '@/models/Post';
import Interaction from '@/models/Interaction';
import { withAuth, RouteContext } from '@/lib/auth/withAuth';
import { CreateCommentSchema } from '@/lib/validation/post';
import mongoose from 'mongoose';
import { createOrganizationNotification } from '@/lib/notifications/notification_service';
import { parsePagination } from '@/lib/api/pagination';
import { handlePublicRouteError } from '@/lib/api/responses';

async function getParamId(context: RouteContext): Promise<string> {
  const resolved = context.params ? await context.params : {};
  const idVal = resolved.id;
  return Array.isArray(idVal) ? idVal[0] : idVal || '';
}

/**
 * GET /api/posts/[id]/comments
 * Public endpoint: Returns all comments for a post.
 */
export async function GET(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const postId = await getParamId(context);

    if (!postId || !mongoose.Types.ObjectId.isValid(postId)) {
      return NextResponse.json({ error: 'Bad Request', message: 'Invalid Post ID' }, { status: 400 });
    }

    const { limit, skip } = parsePagination(new URL(req.url).searchParams);
    const effectiveLimit = Math.min(limit, 50);

    await connectToDatabase();

    const comments = await Interaction.find({ post_id: postId })
      .populate('retailer_id', 'name business_name avatar_url')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(effectiveLimit)
      .lean();

    return NextResponse.json({
      success: true,
      comments,
    });
  } catch (error: unknown) {
    return handlePublicRouteError(error);
  }
}

/**
 * POST /api/posts/[id]/comments
 * Protected endpoint: Retailers and users add comments to a promotional post.
 */
export const POST = withAuth([], async (req, context, session) => {
  const postId = await getParamId(context);

  if (!postId || !mongoose.Types.ObjectId.isValid(postId)) {
    return NextResponse.json({ error: 'Bad Request', message: 'Invalid Post ID' }, { status: 400 });
  }

  const body = await req.json();
  const { comment } = CreateCommentSchema.parse(body);

  await connectToDatabase();

  const post = await Post.findById(postId);
  if (!post) {
    return NextResponse.json({ error: 'Not Found', message: 'Post not found' }, { status: 404 });
  }

  const newInteraction = await Interaction.create({
    post_id: post._id,
    retailer_id: session.user.id,
    comment,
  });

  if (
    post.organization_id &&
    post.organization_id.toString() !== session.user.organizationId
  ) {
    await createOrganizationNotification(post.organization_id, {
      type: 'comment_received',
      title: 'تعليق جديد على المنشور',
      body: `${session.user.name || 'مستخدم'} علّق: ${comment.slice(0, 120)}`,
      postId: post._id,
      metadata: { actorUserId: session.user.id, actorOrganizationId: session.user.organizationId },
    });
  }

  return NextResponse.json(
    {
      success: true,
      message: 'Comment posted successfully',
      interaction: newInteraction,
    },
    { status: 201 }
  );
});
