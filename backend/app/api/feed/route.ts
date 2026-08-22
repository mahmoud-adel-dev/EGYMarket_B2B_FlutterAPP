import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '@/lib/db/mongoose';
import Post from '@/models/Post';
import Interaction from '@/models/Interaction';
import Organization from '@/models/Organization';
import { parsePagination } from '@/lib/api/pagination';
import { anchoredExactRegExp } from '@/lib/utils/regexp';
import { handlePublicRouteError } from '@/lib/api/responses';

/**
 * GET /api/feed
 * Public Endpoint: Returns a Facebook/TikTok-style vertical social feed
 * featuring promotional videos, image showcases, and wholesaler posts tailored by interests.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const governorate = searchParams.get('governorate');
    const { page, limit, skip } = parsePagination(searchParams);

    await connectToDatabase();

    // 1. Build Wholesaler filter if governorate is specified (escaped — never raw).
    const wholesalerFilter: Record<string, unknown> = {
      type: 'wholesaler',
      is_active: true,
      verification_status: 'verified',
    };
    if (governorate) {
      wholesalerFilter['location.governorate'] = { $regex: anchoredExactRegExp(governorate) };
    }

    const wholesalers = await Organization.find(wholesalerFilter)
      .select('_id display_name phone location avatar_url')
      .limit(500)
      .lean();
    const wholesalerIds = wholesalers.map((w) => w._id);
    if (!wholesalerIds.length) {
      return NextResponse.json({
        success: true,
        pagination: { totalPosts: 0, currentPage: 1, totalPages: 0 },
        feed: [],
      });
    }

    // 2. Query posts matching wholesaler filter.
    const postFilter: Record<string, unknown> = { organization_id: { $in: wholesalerIds } };
    if (category && category !== 'All') postFilter.category = category;

    const [posts, totalPosts] = await Promise.all([
      Post.find(postFilter)
        .populate('organization_id', 'display_name phone location avatar_url')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Post.countDocuments(postFilter),
    ]);

    // 3. Attach latest comments in one batched query instead of one per post.
    const commentsByPost = new Map<string, unknown[]>();
    if (posts.length) {
      const recentComments = await Interaction.find({ post_id: { $in: posts.map((p) => p._id) } })
        .populate('retailer_id', 'name role')
        .sort({ createdAt: -1 })
        .limit(posts.length * 10)
        .lean();
      for (const comment of recentComments) {
        const key = (comment.post_id as mongoose.Types.ObjectId).toString();
        const list = commentsByPost.get(key) ?? [];
        if (list.length < 10) list.push(comment);
        commentsByPost.set(key, list);
      }
    }

    const feedItems = posts.map((post) => ({
      id: post._id,
      type: post.media_type, // 'video' | 'image'
      media_urls: post.media_urls,
      caption: post.caption,
      createdAt: post.createdAt,
      wholesaler: post.organization_id,
      commentsCount: commentsByPost.get(post._id.toString())?.length ?? 0,
      comments: commentsByPost.get(post._id.toString()) ?? [],
    }));

    return NextResponse.json({
      success: true,
      pagination: {
        totalPosts,
        currentPage: page,
        totalPages: Math.ceil(totalPosts / limit),
      },
      feed: feedItems,
    });
  } catch (error: unknown) {
    return handlePublicRouteError(error);
  }
}
