import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import connectToDatabase from '@/lib/db/mongoose';
import Cart from '@/models/Cart';
import Follow from '@/models/Follow';
import Order from '@/models/Order';
import Organization from '@/models/Organization';
import Product from '@/models/Product';
import User from '@/models/User';

export const dynamic = 'force-dynamic';

export async function GET() {
  await connectToDatabase();
  const session = await getServerSession(authOptions);
  const isBuyer =
    session?.user?.role === 'Retailer' &&
    Boolean(session.user.id) &&
    Boolean(session.user.organizationId);

  // Recommendations are useful public discovery data. Guests and non-buyers
  // receive popular verified suppliers; signed-in buyers additionally receive
  // interest/cart/order personalization. This also makes stale clients harmless
  // instead of producing repeated 401 console noise.
  let user: any = null;
  let cart: any = null;
  let recentOrders: any[] = [];
  let follows: any[] = [];
  if (isBuyer) {
    const organizationId = session!.user.organizationId!;
    [user, cart, recentOrders, follows] = await Promise.all([
      User.findById(session!.user.id).select('interested_categories').lean(),
      Cart.findOne({ buyer_organization_id: organizationId }).lean(),
      Order.find({ buyer_organization_id: organizationId }).sort({ createdAt: -1 }).limit(20).lean(),
      Follow.find({ follower_organization_id: organizationId }).select('wholesaler_organization_id').lean(),
    ]);
  }

  const productIds = [
    ...(cart?.items || []).map((item: any) => item.product_id),
    ...recentOrders.flatMap((order: any) =>
      order.items.map((item: any) => item.product_id)
    ),
  ];
  const interactedProducts = productIds.length
    ? await Product.find({ _id: { $in: productIds } }).select('category tags').lean()
    : [];
  const interests = new Set<string>(user?.interested_categories || []);
  interactedProducts.forEach((product) => {
    interests.add(product.category);
    product.tags.slice(0, 3).forEach((tag) => interests.add(tag));
  });

  const verifiedWholesalers = await Organization.find({
    type: 'wholesaler',
    verification_status: 'verified',
    is_active: true,
  }).select('_id display_name avatar_url cover_url location description').lean();
  const wholesalerIds = verifiedWholesalers.map((organization) => organization._id);
  const interestList = [...interests];
  const recommendationFilter: Record<string, unknown> = {
    organization_id: { $in: wholesalerIds },
    status: 'active',
    isActive: true,
  };
  if (interestList.length) {
    recommendationFilter.$or = [
      { category: { $in: interestList } },
      { tags: { $in: interestList } },
    ];
  }
  let products = await Product.find(recommendationFilter)
    .populate('organization_id', 'display_name avatar_url location verification_status')
    .sort({ stock_quantity: -1, createdAt: -1 })
    .limit(16)
    .lean();
  if (!products.length && interestList.length) {
    products = await Product.find({
      organization_id: { $in: wholesalerIds }, status: 'active', isActive: true,
    }).populate('organization_id', 'display_name avatar_url location verification_status')
      .sort({ createdAt: -1 }).limit(16).lean();
  }

  const followedIds = new Set(follows.map((follow) => follow.wholesaler_organization_id.toString()));
  const productCounts = await Product.aggregate([
    { $match: { organization_id: { $in: wholesalerIds }, status: 'active', isActive: true } },
    { $match: interestList.length ? { $or: [{ category: { $in: interestList } }, { tags: { $in: interestList } }] } : {} },
    { $group: { _id: '$organization_id', matching_products: { $sum: 1 } } },
  ]);
  const countMap = new Map(productCounts.map((item) => [item._id.toString(), item.matching_products]));
  const wholesalers = verifiedWholesalers
    .filter((organization) => !followedIds.has(organization._id.toString()))
    .map((organization) => ({
      id: organization._id.toString(),
      business_name: organization.display_name,
      avatar_url: organization.avatar_url || '',
      cover_url: organization.cover_url || '',
      location: organization.location,
      business_description: organization.description || '',
      matching_products: countMap.get(organization._id.toString()) || 0,
      recommendation_reason: interestList.length
        ? `Matches ${interestList.slice(0, 3).join(', ')}`
        : 'Popular verified supplier',
    }))
    .sort((a, b) => b.matching_products - a.matching_products)
    .slice(0, 8);

  return NextResponse.json({
    success: true,
    based_on: interestList,
    products,
    wholesalers,
  });
}
