import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectToDatabase from '@/lib/db/mongoose';
import { checkRateLimit } from '@/lib/auth/rate_limit';
import { issueVerificationToken, sendVerificationEmail } from '@/lib/auth/verification';
import User from '@/models/User';
import { handlePublicRouteError } from '@/lib/api/responses';

export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, 3, 15 * 60 * 1000);
    if (limited.isRateLimited) return limited.response!;
    const { email } = z.object({ email: z.string().email().transform((v) => v.toLowerCase()) }).parse(await req.json());
    await connectToDatabase();
    const user = await User.findOne({ email, email_verified_at: { $exists: false }, isActive: true });
    let developmentVerificationToken: string | undefined;
    let verificationDelivery: 'sent' | 'not_configured' = 'sent';
    if (user) {
      const token = await issueVerificationToken(user._id.toString(), 'verify_email');
      try {
        await sendVerificationEmail(user.email, user.name, token);
      } catch (error) {
        console.error('[Verification email failed]', error);
        verificationDelivery = 'not_configured';
      }
      if (process.env.NODE_ENV !== 'production') {
        developmentVerificationToken = token;
      }
    }
    return NextResponse.json({
      success: true,
      message: 'If the account exists, a verification email will be sent',
      verification_delivery: verificationDelivery,
      ...(developmentVerificationToken
        ? { development_verification_token: developmentVerificationToken }
        : {}),
    });
  } catch (error) {
    return handlePublicRouteError(error);
  }
}
