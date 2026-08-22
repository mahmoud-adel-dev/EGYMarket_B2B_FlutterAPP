import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import connectToDatabase from '@/lib/db/mongoose';
import { checkRateLimit } from '@/lib/auth/rate_limit';
import { hashVerificationToken } from '@/lib/auth/verification';
import User from '@/models/User';
import VerificationToken from '@/models/VerificationToken';
import { handlePublicRouteError } from '@/lib/api/responses';

const ResetSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(8).max(128).regex(/[A-Za-z]/).regex(/[0-9]/),
});

export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, 5, 15 * 60 * 1000);
    if (limited.isRateLimited) return limited.response!;
    const data = ResetSchema.parse(await req.json());
    await connectToDatabase();
    const record = await VerificationToken.findOne({
      token_hash: hashVerificationToken(data.token),
      purpose: 'reset_password',
      used_at: { $exists: false },
      expires_at: { $gt: new Date() },
    });
    if (!record) return NextResponse.json({ error: 'Bad Request', message: 'Token is invalid or expired' }, { status: 400 });
    const passwordHash = await bcrypt.hash(data.password, 12);
    await Promise.all([
      User.findByIdAndUpdate(record.user_id, {
        $set: { passwordHash, failed_login_attempts: 0 },
        $inc: { session_version: 1 },
        $unset: { locked_until: 1 },
      }),
      VerificationToken.findByIdAndUpdate(record._id, { $set: { used_at: new Date() } }),
    ]);
    return NextResponse.json({ success: true, message: 'Password reset successfully. Sign in again.' });
  } catch (error) {
    return handlePublicRouteError(error);
  }
}
