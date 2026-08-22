import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { handlePublicRouteError } from '@/lib/api/responses';
import Subscription from '@/models/Subscription';
import SubscriptionInvoice from '@/models/SubscriptionInvoice';

const ProofSchema = z.object({
  payment_method: z.enum(['instapay', 'mobile_wallet', 'bank_transfer', 'cash']),
  sender_reference: z.string().trim().min(3).max(200),
  proof_url: z.string().url(),
});

export const POST = withAuth([], async (req: NextRequest, context, session) => {
  try {
    const params = await context.params;
    const id = params?.id as string;
    const data = ProofSchema.parse(await req.json());
    const invoice = await SubscriptionInvoice.findOne({
      _id: id,
      organization_id: session.user.organizationId,
      status: { $in: ['pending', 'rejected'] },
    });
    if (!invoice) {
      return NextResponse.json({ error: 'Not Found', message: 'Payable invoice not found' }, { status: 404 });
    }

    const updatedSubscription = await Subscription.findOneAndUpdate(
      {
        _id: invoice.subscription_id,
        organization_id: session.user.organizationId,
        status: { $in: ['pending_payment', 'rejected'] },
      },
      { $set: { status: 'under_review' } },
      { new: true }
    );
    if (!updatedSubscription) {
      return NextResponse.json(
        { error: 'Conflict', message: 'Subscription is not awaiting payment review' },
        { status: 409 }
      );
    }

    invoice.status = 'proof_submitted';
    invoice.payment_method = data.payment_method;
    invoice.sender_reference = data.sender_reference;
    invoice.proof_url = data.proof_url;
    invoice.payer_confirmed_at = new Date();
    invoice.rejection_reason = undefined;
    await invoice.save();

    return NextResponse.json({ success: true, message: 'Payment proof submitted for review', invoice });
  } catch (error: unknown) {
    return handlePublicRouteError(error);
  }
});
