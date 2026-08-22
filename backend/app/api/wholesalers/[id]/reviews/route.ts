import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '@/lib/db/mongoose';
import Rating from '@/models/Rating';
import { parsePagination } from '@/lib/api/pagination';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Bad Request', message: 'Invalid wholesaler id' }, { status: 400 });
  }
  const { limit, skip } = parsePagination(new URL(req.url).searchParams);
  const effectiveLimit = Math.min(limit, 200);
  await connectToDatabase();
  const ratingFilter = { target_id: id, target_type: 'wholesaler' };
  const [ratings, totalCount, avgAgg] = await Promise.all([
    Rating.find(ratingFilter)
      .populate('user_id', 'name avatar_url')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(effectiveLimit)
      .lean(),
    Rating.countDocuments(ratingFilter),
    Rating.aggregate([
      { $match: ratingFilter },
      { $group: { _id: null, average: { $avg: '$rating' } } },
    ]),
  ]);
  const reviews = ratings.map((rating: any) => ({
    id: rating._id.toString(),
    reviewerName: rating.user_id?.name || 'مشتري موثق',
    rating: rating.rating,
    comment: rating.review || '',
    date: rating.createdAt,
  }));
  const averageRating =
    totalCount > 0 && typeof avgAgg[0]?.average === 'number' ? avgAgg[0].average : 0;
  return NextResponse.json({ success: true, reviews, totalCount, averageRating });
}
