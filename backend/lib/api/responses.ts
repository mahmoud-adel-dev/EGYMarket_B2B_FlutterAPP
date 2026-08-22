import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

/**
 * Response helpers for routes that do not sit behind `withAuth` (public endpoints).
 * They centralize error mapping so that:
 * - Zod failures become HTTP 400 (never an unhandled 500),
 * - internal error details are never echoed to clients in production,
 * - every response carries a consistent `{error, message, details?}` shape.
 */
export function jsonError(status: number, error: string, message: string, details?: unknown) {
  const body: Record<string, unknown> = { error, message };
  if (details !== undefined) body.details = details;
  return NextResponse.json(body, { status });
}

export function handlePublicRouteError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return jsonError(400, 'Bad Request', 'Validation failed', error.errors);
  }
  console.error('[public_route_error]', error instanceof Error ? error.message : error);
  return jsonError(500, 'Internal Server Error', 'An unexpected server error occurred');
}
