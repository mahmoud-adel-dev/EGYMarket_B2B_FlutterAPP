import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import type { NextRequest } from 'next/server';
import connectToDatabase from '@/lib/db/mongoose';
import User from '@/models/User';
import { LoginCredentialsSchema } from '@/lib/validation/auth';
import { ensureOrganizationForUser } from '@/lib/organizations/organization_service';
import { extractClientIp } from '@/lib/auth/rate_limit';

/** Failed logins before a temporary account lock (per account). */
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
/** Login attempts allowed per client identity per minute (anti password-spraying). */
const LOGIN_ATTEMPTS_PER_MINUTE = 10;

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 14 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'user@marketplace.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(rawCredentials, meta) {
        // 0. Per-identity brute-force throttle. NextAuth hands the request to the
        //    credentials callback so the limiter can be scoped to the login route.
        //    Limiter outages fail open (availability over strictness) by design.
        const req = meta as unknown as NextRequest | undefined;
        let loginThrottled = false;
        if (req?.headers && typeof req.headers.get === 'function') {
          try {
            const { checkIdentityRateLimit } = await import('@/lib/auth/rate_limit');
            loginThrottled = (
              await checkIdentityRateLimit(`login:${extractClientIp(req)}`, 'auth/login', LOGIN_ATTEMPTS_PER_MINUTE)
            ).isRateLimited;
          } catch {
            loginThrottled = false;
          }
        }
        if (loginThrottled) throw new Error('Too many attempts. Please wait a minute and retry.');

        // 1. Validate payload structure using Zod.
        const parsedCredentials = LoginCredentialsSchema.safeParse(rawCredentials);
        if (!parsedCredentials.success) {
          throw new Error('Invalid input format');
        }

        const { email, password } = parsedCredentials.data;

        // 2. Connect to MongoDB singleton.
        await connectToDatabase();

        // 3. Find user and explicitly select security-sensitive fields.
        const user = await User.findOne({ email }).select('+passwordHash +failed_login_attempts +locked_until +session_version');
        if (!user || !user.isActive) {
          throw new Error('Invalid email or password');
        }

        if (user.locked_until && user.locked_until > new Date()) {
          throw new Error('Invalid email or password');
        }

        if (!user.email_verified_at && process.env.ALLOW_UNVERIFIED_LOGIN !== 'true') {
          throw new Error('Email verification required');
        }

        // 4. Verify password hash.
        const isValidPassword = await bcrypt.compare(password, user.passwordHash);
        if (!isValidPassword) {
          // Atomic counter increment: parallel attempts each count exactly once, and
          // every MAXth failure refreshes the lock window. The counter is kept
          // (not reset on lock) so monitoring can observe sustained attacks.
          const updated = await User.findOneAndUpdate(
            { _id: user._id },
            [
              {
                $set: {
                  failed_login_attempts: { $add: [{ $ifNull: ['$failed_login_attempts', 0] }, 1] },
                },
              },
              {
                $set: {
                  locked_until: {
                    $cond: [
                      { $gte: ['$failed_login_attempts', MAX_FAILED_ATTEMPTS] },
                      new Date(Date.now() + LOCK_MINUTES * 60 * 1000),
                      '$locked_until',
                    ],
                  },
                },
              },
            ],
            { new: true, select: '+locked_until' }
          );
          if (updated?.locked_until && updated.locked_until > new Date()) {
            throw new Error('Account temporarily locked due to repeated failed sign-ins');
          }
          throw new Error('Invalid email or password');
        }

        if (user.failed_login_attempts || user.locked_until) {
          await User.updateOne({ _id: user._id }, { $set: { failed_login_attempts: 0 }, $unset: { locked_until: 1 } });
        }

        // Provisioning belongs to registration/login (write paths), never to read paths.
        await ensureOrganizationForUser(user);

        // 5. Return sanitized user identity to NextAuth.
        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          organizationId: user.organization_id?.toString(),
          // Accounts created before session revocation was introduced do not
          // have this field persisted. Treat that legacy value as version 0.
          sessionVersion: user.session_version ?? 0,
        };
      },
    }),
  ],
  callbacks: {
    /**
     * Triggered when NextAuth's encrypted cookie payload is created or updated.
     * NextAuth Credentials requires its own encrypted HttpOnly session cookie.
     * Only the immutable user id is retained; authorization is always reloaded from MongoDB.
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.sessionVersion = user.sessionVersion;
      }
      return token;
    },

    /**
     * Triggered whenever session is accessed (e.g. via getServerSession).
     * Reloads security-sensitive attributes from MongoDB so disabling a user or changing
     * a role takes effect immediately instead of waiting for the cookie to expire.
     * Organization resolution reads the stored membership link without side effects.
     */
    async session({ session, token }) {
      // `sub` is NextAuth's canonical persisted user id. Keep accepting the
      // custom `id` claim for existing cookies, but never depend on it alone.
      const tokenUserId =
        typeof token.id === 'string' && token.id ? token.id : token.sub;
      if (session.user && tokenUserId) {
        await connectToDatabase();
        const dbUser = await User.findById(tokenUserId).select(
          '+session_version',
        );
        const databaseSessionVersion = dbUser?.session_version ?? 0;
        const tokenSessionVersion =
          typeof token.sessionVersion === 'number' ? token.sessionVersion : 0;
        if (dbUser?.isActive && databaseSessionVersion === tokenSessionVersion) {
          session.user.id = dbUser._id.toString();
          session.user.name = dbUser.name;
          session.user.email = dbUser.email;
          session.user.role = dbUser.role;
          session.user.organizationId = dbUser.organization_id?.toString() ?? undefined;
        }
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  useSecureCookies: process.env.NODE_ENV === 'production',
};

export default authOptions;
