import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db/mongoose';
import User from '@/models/User';
import { RegisterSchema } from '@/lib/validation/auth';
import bcrypt from 'bcryptjs';
import { ZodError } from 'zod';
import { checkRateLimit } from '@/lib/auth/rate_limit';
import { createOrganizationForUser } from '@/lib/organizations/organization_service';
import { issueVerificationToken, sendVerificationEmail } from '@/lib/auth/verification';

/**
 * POST /api/auth/register
 * Public endpoint to register new Wholesalers, Retailers, or Shippers.
 */
export async function POST(req: NextRequest) {
  const rateLimit = await checkRateLimit(req, 5, 60 * 1000);
  if (rateLimit.isRateLimited) return rateLimit.response!;

  try {
    const body = await req.json();

    // 1. Validate payload with Zod
    const validatedData = RegisterSchema.parse(body);

    // 2. Connect to MongoDB
    await connectToDatabase();

    // 3. Check for existing user with same email
    const existingUser = await User.findOne({ email: validatedData.email.toLowerCase() });
    if (existingUser) {
      return NextResponse.json(
        { error: 'Conflict', message: 'A user account with this email already exists' },
        { status: 409 }
      );
    }

    // 4. Securely hash password
    const passwordHash = await bcrypt.hash(validatedData.password, 10);

    // 5. Create User document
    const user = await User.create({
      name: validatedData.name,
      email: validatedData.email.toLowerCase(),
      phone: validatedData.phone,
      passwordHash,
      location: validatedData.location,
      role: validatedData.role,
      isActive: true,
      interested_categories: validatedData.interested_categories,
      business_name: validatedData.business_name,
      terms_accepted_at: new Date(),
      terms_version: '2026-08-20',
    });

    const organization = await createOrganizationForUser(user, validatedData.business_name);

    const verificationToken = await issueVerificationToken(user._id.toString(), 'verify_email');
    let verificationDelivery: 'sent' | 'not_configured' = 'sent';
    try {
      await sendVerificationEmail(user.email, user.name, verificationToken);
    } catch (error) {
      console.error('[Verification email delivery failed]', error);
      verificationDelivery = 'not_configured';
    }

    // 6. Return sanitized user data
    return NextResponse.json(
      {
        success: true,
        message: 'Account created. Verify your email before signing in.',
        verification_delivery: verificationDelivery,
        ...(process.env.NODE_ENV !== 'production' ? { development_verification_token: verificationToken } : {}),
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          phone: user.phone,
          location: user.location,
          role: user.role,
          organization_id: organization._id.toString(),
          organization: {
            id: organization._id.toString(),
            type: organization.type,
            display_name: organization.display_name,
            verification_status: organization.verification_status,
          },
          createdAt: user.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    // Concurrent registrations can bypass the pre-check; the unique email index is
    // authoritative — surface it as a conflict, not a server error.
    const code = (error as { code?: number })?.code;
    if (code === 11000) {
      return NextResponse.json(
        { error: 'Conflict', message: 'A user account with this email already exists' },
        { status: 409 }
      );
    }

    console.error('[register]', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected server error occurred' },
      { status: 500 }
    );
  }
}
