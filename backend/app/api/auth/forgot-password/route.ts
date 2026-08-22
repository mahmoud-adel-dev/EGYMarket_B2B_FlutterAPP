import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectToDatabase from '@/lib/db/mongoose';
import { checkRateLimit } from '@/lib/auth/rate_limit';
import { issueVerificationToken, sendPasswordResetEmail } from '@/lib/auth/verification';
import User from '@/models/User';
import { handlePublicRouteError } from '@/lib/api/responses';

export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, 3, 15 * 60 * 1000);
    if (limited.isRateLimited) return limited.response!;
    const { email } = z.object({ email: z.string().email().transform((v) => v.toLowerCase()) }).parse(await req.json());
    await connectToDatabase();
    const user = await User.findOne({ email, isActive: true });
    if (user) {
      const token = await issueVerificationToken(user._id.toString(), 'reset_password');
      await sendPasswordResetEmail(user.email, user.name, token).catch((error) => console.error('[Password reset email failed]', error));
    }
    return NextResponse.json({ success: true, message: 'If the account exists, reset instructions will be sent' });
  } catch (error) {
    return handlePublicRouteError(error);
  }
}
