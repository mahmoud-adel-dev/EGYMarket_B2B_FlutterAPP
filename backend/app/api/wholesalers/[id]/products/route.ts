import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import connectToDatabase from '@/lib/db/mongoose';
import Product from '@/models/Product';
import Organization from '@/models/Organization';
import { authOptions } from '@/lib/auth/authOptions';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ success: true, products: [] });
  }
  const session = await getServerSession(authOptions);
  const isOwner = session?.user?.organizationId === id;
  await connectToDatabase();
  const organization = await Organization.findById(id).select('type verification_status is_active');
  const isPubliclyVisible =
    !!organization &&
    organization.type === 'wholesaler' &&
    organization.verification_status === 'verified' &&
    organization.is_active;
  if (!isPubliclyVisible && !isOwner) {
    return NextResponse.json({ success: true, products: [] });
  }
  const products = await Product.find({ organization_id: id, status: 'active', isActive: true })
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();
  return NextResponse.json({ success: true, products });
}
