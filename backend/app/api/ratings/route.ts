import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db/mongoose';
import Rating from '@/models/Rating';
import { withAuth } from '@/lib/auth/withAuth';
import { z } from 'zod';
import mongoose from 'mongoose';
import Order from '@/models/Order';
import Product from '@/models/Product';
import { createOrganizationNotification } from '@/lib/notifications/notification_service';
import { parsePagination } from '@/lib/api/pagination';
import { handlePublicRouteError } from '@/lib/api/responses';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';

const CreateRatingSchema = z.object({
  target_type: z.enum(['wholesaler', 'product']),
  target_id: z.string().min(1, 'Target ID is required'),
  rating: z.number().min(1).max(5),
  review: z.string().optional(),
});

const TargetTypeSchema = z.enum(['wholesaler', 'product', 'organization']);

/**
 * GET /api/ratings
 * Public endpoint: Fetches average rating and reviews list for a product or wholesaler.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetId = searchParams.get('target_id');
    const parsedTargetType = TargetTypeSchema.safeParse(searchParams.get('target_type'));
    const requestedTargetType = parsedTargetType.success ? parsedTargetType.data : 'product';
    const targetType = requestedTargetType === 'organization' ? 'wholesaler' : requestedTargetType;
    const { page, limit, skip } = parsePagination(searchParams);

    if (!targetId || !mongoose.Types.ObjectId.isValid(targetId)) {
      return NextResponse.json({ error: 'Bad Request', message: 'Invalid target ID' }, { status: 400 });
    }

    await connectToDatabase();

    const session = await getServerSession(authOptions);
    let sellerOrganizationId: string | null = targetType === 'wholesaler' ? targetId : null;
    if (targetType === 'product') {
      const product = await Product.findById(targetId).select('organization_id').lean();
      sellerOrganizationId = product?.organization_id?.toString() || null;
    }
    let eligibility = { can_rate: false, reason: 'login_required' };
    if (session?.user?.role === 'Admin') {
      eligibility = { can_rate: true, reason: 'admin' };
    } else if (session?.user?.role !== 'Retailer' || !session.user.organizationId) {
      eligibility = {
        can_rate: false,
        reason: session?.user ? 'buyer_account_required' : 'login_required',
      };
    } else if (sellerOrganizationId) {
      const eligibleOrder = await Order.exists({
        buyer_organization_id: session.user.organizationId,
        seller_organization_id: sellerOrganizationId,
        status: 'completed',
        ...(targetType === 'product' ? { 'items.product_id': targetId } : {}),
      });
      eligibility = {
        can_rate: Boolean(eligibleOrder),
        reason: eligibleOrder ? 'completed_purchase' : 'completed_purchase_required',
      };
    }

    const ratingFilter = { target_id: targetId, target_type: targetType };
    const [reviews, totalRatings, avgAgg] = await Promise.all([
      Rating.find(ratingFilter)
        .populate('user_id', 'name role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Rating.countDocuments(ratingFilter),
      Rating.aggregate([
        { $match: ratingFilter },
        { $group: { _id: null, average: { $avg: '$rating' } } },
      ]),
    ]);

    const averageRating =
      totalRatings > 0 && typeof avgAgg[0]?.average === 'number'
        ? avgAgg[0].average.toFixed(1)
        : '0.0';

    return NextResponse.json({
      success: true,
      averageRating: parseFloat(averageRating),
      totalRatings,
      reviews,
      eligibility,
    });
  } catch (error: unknown) {
    return handlePublicRouteError(error);
  }
}

/**
 * POST /api/ratings
 * Protected endpoint: Authenticated buyers add or update rating/review.
 */
export const POST = withAuth(['Retailer', 'Admin'], async (req, context, session) => {
  const body = await req.json();
  const { target_type, target_id, rating, review } = CreateRatingSchema.parse(body);

  if (!mongoose.Types.ObjectId.isValid(target_id)) {
    return NextResponse.json({ error: 'Bad Request', message: 'Invalid target ID format' }, { status: 400 });
  }

  await connectToDatabase();

  let sellerOrganizationId = target_id;
  if (target_type === 'product') {
    const product = await Product.findById(target_id).select('organization_id');
    if (!product?.organization_id) {
      return NextResponse.json({ error: 'Not Found', message: 'Product not found' }, { status: 404 });
    }
    sellerOrganizationId = product.organization_id.toString();
  }
  const eligibleOrder = await Order.exists({
    buyer_organization_id: session.user.organizationId,
    seller_organization_id: sellerOrganizationId,
    status: 'completed',
    ...(target_type === 'product' ? { 'items.product_id': target_id } : {}),
  });
  if (!eligibleOrder && session.user.role !== 'Admin') {
    return NextResponse.json(
      { error: 'Forbidden', message: 'A completed purchase is required before rating' },
      { status: 403 }
    );
  }

  const userRating = await Rating.findOneAndUpdate(
    {
      target_id,
      target_type,
      user_id: session.user.id,
    },
    {
      $set: {
        rating,
        review,
      },
    },
    { upsert: true, new: true, runValidators: true }
  );

  if (sellerOrganizationId !== session.user.organizationId) {
    await createOrganizationNotification(sellerOrganizationId, {
      type: 'rating_received',
      title: 'تقييم جديد',
      body: `${session.user.name || 'مشتري'} قيّم ${target_type === 'product' ? 'منتجًا' : 'متجرك'} بـ ${rating} من 5.`,
      metadata: { targetType: target_type, targetId: target_id, actorUserId: session.user.id },
    });
  }

  return NextResponse.json(
    {
      success: true,
      message: 'Rating submitted successfully',
      rating: userRating,
    },
    { status: 201 }
  );
});
