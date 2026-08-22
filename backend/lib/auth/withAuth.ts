import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { UserRole } from '@/types/next-auth';
import connectToDatabase from '@/lib/db/mongoose';
import { ZodError } from 'zod';
import User from '@/models/User';
import Organization from '@/models/Organization';
import OrganizationMember from '@/models/OrganizationMember';
import { ApiError } from '@/lib/errors/api_error';

export interface RouteContext {
  params?: Record<string, string | string[]> | Promise<Record<string, string | string[]>>;
}

/**
 * Signature for authenticated API route handler function.
 */
export type AuthenticatedHandler = (
  req: NextRequest,
  context: RouteContext,
  session: SessionContext
) => Promise<NextResponse>;

/** Normalized authorization context derived fresh from MongoDB on every request. */
export interface SessionContext {
  user: {
    id: string;
    role: UserRole;
    email?: string | null;
    name?: string | null;
    organizationId?: string;
    organizationMemberRole?: 'owner' | 'manager' | 'staff';
  };
}

function errorResponse(status: number, error: string, message: string, details?: unknown) {
  return NextResponse.json(details !== undefined ? { error, message, details } : { error, message }, { status });
}

/**
 * Canonical NextAuth/Auth.js Guard for the App Router.
 * Resolves session identity through NextAuth HttpOnly session cookies and re-derives
 * every authorization attribute from MongoDB (never stale cookie claims):
 * account active, role allowed, organization active/not suspended, membership active.
 * RBAC is enforced centrally here; resource-level checks stay with each route.
 */
export function withAuth(
  allowedRoles: UserRole[] = [],
  handler: AuthenticatedHandler
) {
  return async (req: NextRequest, context: RouteContext = {}): Promise<NextResponse> => {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    try {
      // 1. Resolve only the official NextAuth session cookie.
      const nextAuthSession = await getServerSession(authOptions);
      if (!nextAuthSession?.user?.id) {
        return errorResponse(401, 'Unauthorized', 'Authentication required. Missing or invalid NextAuth session.');
      }

      // 2. MongoDB is the authorization authority, never stale cookie claims.
      await connectToDatabase();
      const dbUser = await User.findById(nextAuthSession.user.id);
      if (!dbUser || !dbUser.isActive) {
        return errorResponse(401, 'Unauthorized', 'User account not found or disabled.');
      }

      if (allowedRoles.length > 0 && !allowedRoles.includes(dbUser.role)) {
        return errorResponse(403, 'Forbidden', `Access denied. Requires one of the following roles: [${allowedRoles.join(', ')}]`);
      }

      let memberRole: 'owner' | 'manager' | 'staff' | undefined;
      let organizationId: string | undefined;
      if (dbUser.organization_id) {
        const [organization] = await Promise.all([
          Organization.findById(dbUser.organization_id),
          OrganizationMember.exists({
            organization_id: dbUser.organization_id,
            user_id: dbUser._id,
            status: 'active',
          }),
        ]);
        if (!organization) {
          return errorResponse(401, 'Unauthorized', 'Organization not found.');
        }
        if (!organization.is_active || organization.verification_status === 'suspended') {
          return errorResponse(403, 'Forbidden', 'Organization is disabled or suspended.');
        }
        organizationId = organization._id.toString();
      }

      // Membership lookup (role) is a second query only when the org exists.
      if (organizationId) {
        const membership = await OrganizationMember.findOne({
          organization_id: dbUser.organization_id,
          user_id: dbUser._id,
          status: 'active',
        }).select('role');
        if (!membership) {
          return errorResponse(403, 'Forbidden', 'No active organization membership.');
        }
        memberRole = membership.role;
      }

      const session: SessionContext = {
        user: {
          id: dbUser._id.toString(),
          role: dbUser.role,
          email: dbUser.email,
          name: dbUser.name,
          organizationId,
          organizationMemberRole: memberRole,
        },
      };

      // 3. Execute route handler logic.
      const res = await handler(req, context, session);
      res.headers.set('x-request-id', requestId);
      logRequest(requestId, req.method, new URL(req.url).pathname, res.status, Date.now() - startedAt, dbUser._id.toString());
      return res;
    } catch (error: unknown) {
      logRequest(requestId, req.method, safePathname(req), 500, Date.now() - startedAt, undefined, error);

      if (error instanceof ZodError) {
        const res = errorResponse(400, 'Bad Request', 'Validation failed', error.errors);
        res.headers.set('x-request-id', requestId);
        return res;
      }

      if (error instanceof ApiError) {
        const res = errorResponse(error.status, error.code, error.message, error.details);
        res.headers.set('x-request-id', requestId);
        return res;
      }

      // Never leak internal error details to clients in production.
      const errorMessage = process.env.NODE_ENV === 'production'
        ? 'An unexpected server error occurred'
        : error instanceof Error ? error.message : 'Internal Server Error';
      const res = errorResponse(500, 'Internal Server Error', errorMessage);
      res.headers.set('x-request-id', requestId);
      return res;
    }
  };
}

function safePathname(req: NextRequest): string {
  try {
    return new URL(req.url).pathname;
  } catch {
    return 'unknown';
  }
}

type LogFields = Record<string, unknown>;

/**
 * Structured single-line JSON logging. Sensitive values (passwords, cookies,
 * payment references) must never be passed as fields; we only log metadata.
 */
function logRequest(
  requestId: string,
  method: string,
  path: string,
  status: number,
  durationMs: number,
  userId?: string,
  error?: unknown
) {
  const fields: LogFields = {
    level: error ? 'error' : 'info',
    msg: 'http_request',
    request_id: requestId,
    method,
    path,
    status,
    duration_ms: durationMs,
  };
  if (userId) fields.user_id = userId;
  if (error instanceof ApiError) {
    fields.error_code = error.code;
    fields.error_status = error.status;
  } else if (error instanceof Error && !(error instanceof ZodError)) {
    fields.error_name = error.name;
    fields.error_message = process.env.NODE_ENV === 'production'
      ? error.message.slice(0, 200)
      : error.stack?.split('\n')[0];
  }
  console.log(JSON.stringify(fields));
}
