import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db/mongoose';
import User from '@/models/User';
import VerificationToken from '@/models/VerificationToken';
import { hashVerificationToken } from '@/lib/auth/verification';
import { checkRateLimit } from '@/lib/auth/rate_limit';

async function verify(req: NextRequest) {
  // Token consumption is a one-shot capability grant; throttle guessing attempts.
  const limited = await checkRateLimit(req, 10, 60 * 1000);
  if (limited.isRateLimited) return limited.response!;
  try {
    await connectToDatabase();
    const urlToken = new URL(req.url).searchParams.get('token');
    const bodyToken = req.method === 'POST' ? (await req.json().catch(() => ({}))).token : undefined;
    const token = urlToken || bodyToken;
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Bad Request', message: 'Verification token is required' }, { status: 400 });
    }
    const record = await VerificationToken.findOne({
      token_hash: hashVerificationToken(token),
      purpose: 'verify_email',
      used_at: { $exists: false },
      expires_at: { $gt: new Date() },
    });
    if (!record) return NextResponse.json({ error: 'Bad Request', message: 'Token is invalid or expired' }, { status: 400 });
    await Promise.all([
      User.findByIdAndUpdate(record.user_id, { $set: { email_verified_at: new Date() } }),
      VerificationToken.findByIdAndUpdate(record._id, { $set: { used_at: new Date() } }),
    ]);
    return NextResponse.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    console.error('[verify-email]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Internal Server Error', message: 'An unexpected server error occurred' }, { status: 500 });
  }
}

export const GET = verify;
export const POST = verify;
