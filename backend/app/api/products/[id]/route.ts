import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '@/lib/db/mongoose';
import { withAuth } from '@/lib/auth/withAuth';
import Product from '@/models/Product';
import Organization from '@/models/Organization';
import { UpdateProductSchema } from '@/lib/validation/product';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Bad Request', message: 'Invalid product id' }, { status: 400 });
  }
  await connectToDatabase();
  const product = await Product.findOne({ _id: id, status: 'active', isActive: true })
    .populate('organization_id', 'display_name avatar_url location verification_status')
    .lean();
  if (!product) return NextResponse.json({ error: 'Not Found', message: 'Product not found' }, { status: 404 });
  return NextResponse.json({ success: true, product });
}

export const PATCH = withAuth(['Wholesaler', 'Admin'], async (req: NextRequest, context, session) => {
  const params = await context.params;
  const id = params?.id as string;
  const data = UpdateProductSchema.parse(await req.json());
  const product = await Product.findById(id);
  if (!product) return NextResponse.json({ error: 'Not Found', message: 'Product not found' }, { status: 404 });
  if (session.user.role !== 'Admin' && product.organization_id?.toString() !== session.user.organizationId) {
    return NextResponse.json({ error: 'Forbidden', message: 'Product belongs to another organization' }, { status: 403 });
  }
  if (data.publish) {
    const organization = await Organization.findById(product.organization_id);
    if (organization?.verification_status !== 'verified') {
      return NextResponse.json({ error: 'Forbidden', message: 'Organization verification is required to publish' }, { status: 403 });
    }
  }
  const update: Record<string, unknown> = { ...data };
  delete update.publish;
  if (data.price_piasters !== undefined) update.price = data.price_piasters / 100;
  if (data.publish !== undefined) {
    const stock = data.stock_quantity ?? product.stock_quantity;
    update.status = data.publish ? (stock > 0 ? 'active' : 'out_of_stock') : 'draft';
    update.isActive = data.publish && stock > 0;
  }
  Object.assign(product, update);
  await product.save();
  return NextResponse.json({ success: true, product });
});

export const DELETE = withAuth(['Wholesaler', 'Admin'], async (req, context, session) => {
  const params = await context.params;
  const product = await Product.findById(params?.id as string);
  if (!product) return NextResponse.json({ error: 'Not Found', message: 'Product not found' }, { status: 404 });
  if (session.user.role !== 'Admin' && product.organization_id?.toString() !== session.user.organizationId) {
    return NextResponse.json({ error: 'Forbidden', message: 'Product belongs to another organization' }, { status: 403 });
  }
  product.status = 'archived';
  product.isActive = false;
  await product.save();
  return NextResponse.json({ success: true, message: 'Product archived' });
});
