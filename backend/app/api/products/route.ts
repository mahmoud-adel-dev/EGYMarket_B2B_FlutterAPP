import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db/mongoose';
import Product from '@/models/Product';
import Organization from '@/models/Organization';
import { withAuth } from '@/lib/auth/withAuth';
import { CreateProductSchema, ProductQuerySchema } from '@/lib/validation/product';
import { hasTradingEntitlement } from '@/lib/subscriptions/entitlements';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import User from '@/models/User';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function serializeProduct(product: Record<string, any>) {
  const { cost_price_piasters: _privateCost, ...safeProduct } = product;
  const pricePiasters = product.price_piasters ?? Math.round((product.price || 0) * 100);
  return { ...safeProduct, price_piasters: pricePiasters, price: pricePiasters / 100, currency: 'EGP' };
}

export const POST = withAuth(['Wholesaler'], async (req, context, session) => {
  if (!session.user.organizationId) {
    return NextResponse.json({ error: 'Bad Request', message: 'Organization is required' }, { status: 400 });
  }
  const [organization, entitled] = await Promise.all([
    Organization.findById(session.user.organizationId),
    hasTradingEntitlement(session.user.organizationId),
  ]);
  if (!organization || organization.type !== 'wholesaler') {
    return NextResponse.json({ error: 'Forbidden', message: 'Wholesaler organization required' }, { status: 403 });
  }
  if (!entitled) {
    return NextResponse.json({ error: 'Payment Required', message: 'An active subscription is required' }, { status: 402 });
  }

  const data = CreateProductSchema.parse(await req.json());
  const canPublish = data.publish && organization.verification_status === 'verified';
  const product = await Product.create({
    ...data,
    price: data.price_piasters / 100,
    organization_id: organization._id,
    wholesaler_id: session.user.id,
    status: canPublish ? (data.stock_quantity > 0 ? 'active' : 'out_of_stock') : 'draft',
    isActive: canPublish && data.stock_quantity > 0,
  });
  const visibleInCatalog = product.status === 'active' && product.isActive;
  const publicationReason = !data.publish
    ? 'saved_as_draft'
    : organization.verification_status !== 'verified'
      ? 'organization_verification_required'
      : data.stock_quantity === 0
        ? 'stock_required'
        : null;
  return NextResponse.json({
    success: true,
    message: visibleInCatalog
      ? 'Product published in the catalog'
      : 'Product saved but is not visible in the public catalog yet',
    publication: {
      requested: data.publish,
      visible_in_catalog: visibleInCatalog,
      reason: publicationReason,
    },
    product: serializeProduct(product.toObject()),
  }, { status: 201 });
});

export async function GET(req: NextRequest) {
  await connectToDatabase();
  const session = await getServerSession(authOptions);
  const params = new URL(req.url).searchParams;
  const query = ProductQuerySchema.parse({
    category: params.get('category') || undefined,
    tags: params.get('tags') || undefined,
    governorate: params.get('governorate') || undefined,
    q: params.get('q') || undefined,
    min_price: params.get('min_price') || undefined,
    max_price: params.get('max_price') || undefined,
    min_stock: params.get('min_stock') || undefined,
    sale_type: params.get('sale_type') || undefined,
    sort: params.get('sort') || undefined,
    page: params.get('page') || 1,
    limit: params.get('limit') || 20,
  });
  const verifiedOrganizations = await Organization.find({
    type: 'wholesaler',
    verification_status: 'verified',
    is_active: true,
  }).select('_id');
  const verifiedOrganizationIds = verifiedOrganizations.map((organization) => organization._id);
  const filter: Record<string, unknown> = {
    status: 'active',
    isActive: true,
    organization_id: { $in: verifiedOrganizationIds },
  };
  const organizationId = params.get('organization_id') || params.get('wholesaler_id');
  if (organizationId) {
    filter.organization_id = verifiedOrganizationIds.some((id) => id.toString() === organizationId)
      ? organizationId
      : { $in: [] };
  }
  if (query.category) filter.category = query.category;
  if (query.tags) filter.tags = { $in: query.tags.split(',').map((v) => v.trim()).filter(Boolean) };
  if (query.sale_type) filter.sale_type = query.sale_type;
  if (query.min_stock !== undefined) filter.stock_quantity = { $gte: query.min_stock };
  if (query.min_price !== undefined || query.max_price !== undefined) {
    filter.price_piasters = {
      ...(query.min_price !== undefined ? { $gte: Math.round(query.min_price * 100) } : {}),
      ...(query.max_price !== undefined ? { $lte: Math.round(query.max_price * 100) } : {}),
    };
  }
  if (query.q) {
    const regex = new RegExp(escapeRegExp(query.q), 'i');
    const matchingOrganizations = await Organization.find({
      _id: { $in: verifiedOrganizationIds },
      $or: [{ display_name: regex }, { legal_name: regex }],
    }).select('_id');
    filter.$or = [
      { title: regex },
      { description: regex },
      { sku: regex },
      { category: regex },
      { tags: regex },
      { organization_id: { $in: matchingOrganizations.map((organization) => organization._id) } },
    ];
  }
  if (query.governorate) {
    const organizations = await Organization.find({
      type: 'wholesaler',
      verification_status: 'verified',
      is_active: true,
      'location.governorate': query.governorate,
    }).select('_id');
    filter.organization_id = { $in: organizations.map((o) => o._id) };
  }

  const skip = (query.page - 1) * query.limit;
  const sort: Record<string, 1 | -1> = query.sort === 'price_asc'
    ? { price_piasters: 1 }
    : query.sort === 'price_desc'
      ? { price_piasters: -1 }
      : query.sort === 'stock_desc'
        ? { stock_quantity: -1 }
        : { createdAt: -1 };
  sort._id = -1;

  let interestCategories: string[] = [];
  if (session?.user?.id && session.user.role === 'Retailer' && !query.category && !query.q) {
    const currentUser = await User.findById(session.user.id).select('interested_categories').lean();
    interestCategories = (currentUser?.interested_categories || []).filter(Boolean);
  }

  const productsPromise = interestCategories.length > 0
    ? (async () => {
        const rankedIds = await Product.aggregate([
          { $match: filter },
          {
            $addFields: {
              interest_priority: {
                $cond: [{ $in: ['$category', interestCategories] }, 0, 1],
              },
            },
          },
          { $sort: { interest_priority: 1, ...sort } },
          { $skip: skip },
          { $limit: query.limit },
          { $project: { _id: 1 } },
        ]);
        const ids = rankedIds.map((row) => row._id);
        const rows = await Product.find({ _id: { $in: ids } })
          .populate('organization_id', 'display_name slug avatar_url location verification_status')
          .lean();
        const byId = new Map(rows.map((row) => [row._id.toString(), row]));
        return ids.map((id) => byId.get(id.toString())).filter(Boolean);
      })()
    : Product.find(filter)
        .populate('organization_id', 'display_name slug avatar_url location verification_status')
        .sort(sort)
        .skip(skip)
        .limit(query.limit)
        .lean();
  const [products, total, categoryFacets, priceBounds] = await Promise.all([
    productsPromise,
    Product.countDocuments(filter),
    Product.aggregate([
      { $match: { status: 'active', isActive: true, organization_id: { $in: verifiedOrganizationIds } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]),
    Product.aggregate([
      { $match: { status: 'active', isActive: true, organization_id: { $in: verifiedOrganizationIds } } },
      { $group: { _id: null, min: { $min: '$price_piasters' }, max: { $max: '$price_piasters' } } },
    ]),
  ]);
  return NextResponse.json({
    success: true,
    products: products.map((p) => serializeProduct(p as any)),
    pagination: { page: query.page, limit: query.limit, total, total_pages: Math.ceil(total / query.limit) },
    facets: {
      categories: categoryFacets.map((item) => ({ name: item._id, count: item.count })),
      price: { min: (priceBounds[0]?.min || 0) / 100, max: (priceBounds[0]?.max || 0) / 100 },
    },
  });
}
