import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '@/lib/db/mongoose';
import Post from '@/models/Post';
import Interaction from '@/models/Interaction';
import Organization from '@/models/Organization';
import { withAuth } from '@/lib/auth/withAuth';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import PostLike from '@/models/PostLike';
import Product from '@/models/Product';
import { parsePagination } from '@/lib/api/pagination';
import { escapeRegExp } from '@/lib/utils/regexp';
import { handlePublicRouteError } from '@/lib/api/responses';

const CreatePostSchema = z.object({
  caption: z.string().min(1, 'Caption is required').max(2000),
  category: z.string().min(1).default('General'),
  media_type: z.enum(['image', 'video']),
  media_urls: z.array(z.string().url()).max(8).optional().default([]),
  video_url: z.string().url().optional(),
  video_urls: z.array(z.string().url()).max(8).optional().default([]),
  product_id: z.string().refine((value) => !value || /^[a-f\d]{24}$/i.test(value), 'Invalid product id').optional(),
});

/**
 * GET /api/posts
 * Public endpoint: Returns paginated social posts with search & category filtering.
 * Query params: page, limit, category, search, wholesaler_id, post_id
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit, skip } = parsePagination(searchParams);
    const category = searchParams.get('category')?.trim();
    const search = searchParams.get('search')?.trim();
    const postId = searchParams.get('post_id')?.trim();
    const wholesalerId = searchParams.get('organization_id')?.trim() || searchParams.get('wholesaler_id')?.trim();

    if (postId && !mongoose.Types.ObjectId.isValid(postId)) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Invalid post id' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const session = await getServerSession(authOptions);

    // Only verified, active wholesalers are publicly browsable. A requested
    // organization filter INTERSECTS with this set — it can never widen it.
    const verifiedSellerIds = await Organization.find({
      type: 'wholesaler',
      verification_status: 'verified',
      is_active: true,
    }).distinct('_id');
    let orgFilter: Record<string, unknown> = { $in: verifiedSellerIds };
    if (wholesalerId && verifiedSellerIds.some((id) => id.toString() === wholesalerId)) {
      orgFilter = { $in: [wholesalerId] };
    }
    const filter: Record<string, unknown> = { organization_id: orgFilter };
    if (postId) filter._id = postId;
    if (category && category !== 'All') filter.category = category;
    if (search) {
      filter.$or = [
        { caption: { $regex: escapeRegExp(search), $options: 'i' } },
        { category: { $regex: escapeRegExp(search), $options: 'i' } },
      ];
    }

    const [posts, totalPosts] = await Promise.all([
      Post.find(filter)
        .populate('organization_id', 'display_name phone location avatar_url cover_url verification_status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Post.countDocuments(filter),
    ]);

    const [currentUserLikes, commentCounts] = await Promise.all([
      session?.user?.id
        ? PostLike.find({
            user_id: session.user.id,
            post_id: { $in: posts.map((post) => post._id) },
          }).distinct('post_id')
        : [],
      // One aggregated query instead of one count per post (N+1 elimination).
      Interaction.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
        { $match: { post_id: { $in: posts.map((post) => post._id) } } },
        { $group: { _id: '$post_id', count: { $sum: 1 } } },
      ]),
    ]);
    const commentCountByPost = new Map(commentCounts.map((row) => [row._id.toString(), row.count]));
    const likedPostIds = new Set(currentUserLikes.map((id) => id.toString()));

    const enrichedPosts = await Promise.all(
      posts.map(async (post) => {
        const comments = await Interaction.find({ post_id: post._id })
          .populate('retailer_id', 'name avatar_url')
          .sort({ createdAt: -1 })
          .limit(5)
          .lean();

        const seller = post.organization_id as any;
        return {
          id: post._id.toString(),
          wholesalerId: seller?._id?.toString() || '',
          wholesalerName: seller?.display_name || 'Wholesaler Merchant',
          wholesalerGovernorate: seller?.location?.governorate || 'Cairo',
          wholesalerAvatar: seller?.avatar_url || '',
          caption: post.caption,
          category: post.category || 'General',
          mediaUrls: (post as any).media_urls?.length
            ? (post as any).media_urls
            : (post as any).media_url
              ? [(post as any).media_url]
              : [],
          videoUrl: (post as any).video_url || null,
          videoUrls: (post as any).video_urls?.length
            ? (post as any).video_urls
            : (post as any).video_url
              ? [(post as any).video_url]
              : [],
          mediaType: post.media_type,
          commentsCount: commentCountByPost.get(post._id.toString()) ?? 0,
          likesCount: (post as any).likes_count || 0,
          likedByCurrentUser: likedPostIds.has(post._id.toString()),
          productId: (post as any).product_id?.toString() || null,
          createdAt: post.createdAt,
          comments: comments.map((c: any) => ({
            id: c._id?.toString(),
            text: c.comment || '',
            buyerName: c.retailer_id?.name || 'Buyer',
            avatarUrl: c.retailer_id?.avatar_url || '',
          })),
        };
      })
    );

    // Aggregate distinct categories for filter chips
    const allCategories = await Post.distinct('category', { organization_id: { $in: verifiedSellerIds } });

    return NextResponse.json({
      success: true,
      pagination: {
        totalPosts,
        totalPages: Math.ceil(totalPosts / limit),
        currentPage: page,
        pageSize: limit,
        hasMore: page < Math.ceil(totalPosts / limit),
      },
      categories: ['All', ...allCategories.filter(Boolean)],
      posts: enrichedPosts,
    });
  } catch (error: unknown) {
    return handlePublicRouteError(error);
  }
}

/**
 * POST /api/posts
 * Protected: Wholesalers create social posts (up to 8 images OR 1 video).
 */
export const POST = withAuth(['Wholesaler', 'Admin'], async (req, _context, session) => {
  try {
    const body = await req.json();
    const data = CreatePostSchema.parse(body);

    // Validation: image or video, not both
    if (data.media_type === 'image' && (!data.media_urls || data.media_urls.length === 0)) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'At least one image URL is required for image posts' },
        { status: 400 }
      );
    }
    if (data.media_type === 'video' && !data.video_url && data.video_urls.length === 0) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'A video URL is required for video posts' },
        { status: 400 }
      );
    }

    await connectToDatabase();

    if (data.product_id) {
      const product = await Product.findOne({
        _id: data.product_id,
        organization_id: session.user.organizationId,
        status: 'active',
        isActive: true,
      }).select('_id');
      if (!product) {
        return NextResponse.json(
          { error: 'Bad Request', message: 'The linked product does not belong to this seller' },
          { status: 400 }
        );
      }
    }

    const post = await Post.create({
      wholesaler_id: session.user.id,
      organization_id: session.user.organizationId,
      caption: data.caption,
      category: data.category,
      media_type: data.media_type,
      media_urls: data.media_type === 'image' ? data.media_urls : [],
      video_url: data.media_type === 'video' ? data.video_url : undefined,
      video_urls: data.media_type === 'video'
        ? (data.video_urls.length ? data.video_urls : data.video_url ? [data.video_url] : [])
        : [],
      product_id: data.product_id,
    });

    return NextResponse.json(
      { success: true, message: 'Post published successfully!', post: { id: post._id.toString() } },
      { status: 201 }
    );
  } catch (error: unknown) {
    if ((error as any)?.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation Error', message: (error as any).errors?.[0]?.message || 'Invalid data' },
        { status: 400 }
      );
    }
    console.error('[posts.create]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Internal Server Error', message: 'An unexpected server error occurred' }, { status: 500 });
  }
});
