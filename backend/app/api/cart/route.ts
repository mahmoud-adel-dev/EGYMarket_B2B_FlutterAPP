import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import Cart from '@/models/Cart';
import Product from '@/models/Product';

const ItemSchema = z.object({
  product_id: z.string().regex(/^[a-f\d]{24}$/i),
  quantity: z.number().int().positive(),
});

async function loadCart(organizationId: string) {
  return Cart.findOneAndUpdate(
    { buyer_organization_id: organizationId },
    { $setOnInsert: { buyer_organization_id: organizationId, items: [] } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate({ path: 'items.product_id', populate: { path: 'organization_id', select: 'display_name location' } });
}

function serializeCart(cart: any) {
  const items = (cart?.items || []).filter((item: any) => item.product_id).map((item: any) => {
    const product = item.product_id;
    const unitPrice = product.price_piasters ?? Math.round((product.price || 0) * 100);
    return {
      product,
      product_id: product._id,
      quantity: item.quantity,
      unit_price_piasters: unitPrice,
      subtotal_piasters: unitPrice * item.quantity,
    };
  });
  return {
    id: cart?._id,
    items,
    total_items: items.reduce((sum: number, item: any) => sum + item.quantity, 0),
    subtotal_piasters: items.reduce((sum: number, item: any) => sum + item.subtotal_piasters, 0),
    currency: 'EGP',
  };
}

export const GET = withAuth(['Retailer'], async (req, context, session) => {
  if (!session.user.organizationId) return NextResponse.json({ success: true, cart: serializeCart(null) });
  const cart = await loadCart(session.user.organizationId);
  return NextResponse.json({ success: true, cart: serializeCart(cart) });
});

export const POST = withAuth(['Retailer'], async (req: NextRequest, context, session) => {
  if (!session.user.organizationId) {
    return NextResponse.json({ error: 'Bad Request', message: 'Buyer organization is required' }, { status: 400 });
  }
  const data = ItemSchema.parse(await req.json());
  const product = await Product.findOne({ _id: data.product_id, status: 'active', isActive: true });
  if (!product) return NextResponse.json({ error: 'Not Found', message: 'Product not found' }, { status: 404 });
  if (data.quantity < product.moq) {
    return NextResponse.json({ error: 'Bad Request', message: `Minimum quantity is ${product.moq}` }, { status: 400 });
  }
  if (data.quantity > product.stock_quantity - product.reserved_quantity) {
    return NextResponse.json({ error: 'Conflict', message: 'Requested quantity is not available' }, { status: 409 });
  }
  const cart = await Cart.findOne({ buyer_organization_id: session.user.organizationId });
  if (!cart) {
    await Cart.create({ buyer_organization_id: session.user.organizationId, items: [{ product_id: product._id, quantity: data.quantity }] });
  } else {
    const item = cart.items.find((entry) => entry.product_id.toString() === data.product_id);
    if (item) item.quantity = data.quantity;
    else cart.items.push({ product_id: product._id, quantity: data.quantity, added_at: new Date() });
    await cart.save();
  }
  return NextResponse.json({ success: true, cart: serializeCart(await loadCart(session.user.organizationId)) }, { status: 201 });
});

export const PATCH = POST;

export const DELETE = withAuth(['Retailer'], async (req: NextRequest, context, session) => {
  const { product_id } = z.object({ product_id: z.string().regex(/^[a-f\d]{24}$/i) }).parse(await req.json());
  await Cart.updateOne(
    { buyer_organization_id: session.user.organizationId },
    { $pull: { items: { product_id } } }
  );
  return NextResponse.json({ success: true, cart: serializeCart(await loadCart(session.user.organizationId || '')) });
});
