import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { withAuth, RouteContext } from '@/lib/auth/withAuth';
import Post from '@/models/Post';
import PostLike from '@/models/PostLike';
import { createOrganizationNotification } from '@/lib/notifications/notification_service';

async function postId(context: RouteContext) {
  const params = context.params ? await context.params : {};
  const value = params.id;
  return Array.isArray(value) ? value[0] : value || '';
}

/** Toggle one authenticated user's like. The compound index prevents duplicate likes. */
export const POST = withAuth([], async (_req: NextRequest, context, session) => {
  const id = await postId(context);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Bad Request', message: 'Invalid post id' }, { status: 400 });
  }

  const post = await Post.findById(id).select('organization_id likes_count caption');
  if (!post) {
    return NextResponse.json({ error: 'Not Found', message: 'Post not found' }, { status: 404 });
  }

  // The unique PostLike index decides the toggle outcome; the denormalized counter is
  // adjusted with an atomic $inc driven by that result, so concurrent likes never drift.
  const removed = await PostLike.findOneAndDelete({ post_id: post._id, user_id: session.user.id });
  let liked: boolean;
  if (removed) {
    liked = false;
    await Post.updateOne({ _id: post._id }, { $inc: { likes_count: -1 } });
  } else {
    try {
      await PostLike.create({
        post_id: post._id,
        user_id: session.user.id,
        organization_id: session.user.organizationId,
      });
      liked = true;
      await Post.updateOne({ _id: post._id }, { $inc: { likes_count: 1 } });
    } catch (error) {
      // Lost a double-like race to the unique index — the like already exists.
      if ((error as { code?: number })?.code !== 11000) throw error;
      liked = true;
    }
  }
  const fresh = await Post.findById(id).select('likes_count');

  if (
    liked &&
    post.organization_id &&
    post.organization_id.toString() !== session.user.organizationId
  ) {
    await createOrganizationNotification(post.organization_id, {
      type: 'post_liked',
      title: 'إعجاب جديد بالمنشور',
      body: `${session.user.name || 'مستخدم'} أعجب بمنشورك.`,
      postId: post._id,
      metadata: { actorUserId: session.user.id, actorOrganizationId: session.user.organizationId },
    }).catch(() => {});
  }

  return NextResponse.json({ success: true, liked, likesCount: fresh?.likes_count ?? post.likes_count });
});
