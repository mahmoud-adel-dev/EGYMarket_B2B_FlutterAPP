import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db/mongoose';
import RateLimit from '@/models/RateLimit';

/**
 * Extract the best-available client identity for rate limiting.
 *
 * Trust model:
 * - Production deployments sit behind Caddy, which overwrites/appends the true client
 *   address as the LAST `x-forwarded-for` entry. Enable `TRUST_PROXY_HEADERS=true`
 *   so the limiter uses that value.
 * - Without a trusted proxy no header can be believed (all are attacker-writable), so
 *   we deliberately collapse every caller into one shared bucket ("untrusted"). This
 *   fails closed: limits cannot be bypassed by header rotation; they are simply
 *   stricter than necessary until TRUST_PROXY_HEADERS is configured.
 */
export function extractClientIp(req: NextRequest): string {
  const normalized = (value?: string | null) => value?.replace(/^::ffff:/, '').trim();
  const trusted = process.env.TRUST_PROXY_HEADERS === 'true';
  const xff = req.headers.get('x-forwarded-for');
  if (trusted && xff) {
    const hops = xff.split(',').map(normalized).filter(Boolean) as string[];
    if (hops.length) return hops[hops.length - 1];
  }
  if (!trusted) return 'untrusted';
  return normalized(req.headers.get('x-real-ip')) || 'unknown';
}

/** Pure helper (unit-tested): builds the hashed fixed-window bucket key. */
export function buildRateLimitKey(identity: string, scope: string, bucket: number): string {
  return createHash('sha256').update(`${identity}:${scope}:${bucket}`).digest('hex');
}

interface RateLimitResult {
  isRateLimited: boolean;
  response?: NextResponse;
}

async function consumeBucket(identity: string, scope: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  await connectToDatabase();
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const key = buildRateLimitKey(identity, scope, bucket);
  const expiresAt = new Date((bucket + 1) * windowMs + 60_000);
  const entry = await RateLimit.findOneAndUpdate(
    { key },
    { $inc: { count: 1 }, $setOnInsert: { expires_at: expiresAt } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  if (!entry || entry.count <= limit) return { isRateLimited: false };
  const retryAfter = Math.max(Math.ceil(((bucket + 1) * windowMs - now) / 1000), 1);
  return {
    isRateLimited: true,
    response: NextResponse.json(
      { error: 'Too Many Requests', message: 'Too many requests, please try again later.' },
      { status: 429, headers: { 'Retry-After': retryAfter.toString() } }
    ),
  };
}

/** Per-client-IP fixed-window limiter scoped to the request path. */
export async function checkRateLimit(
  req: NextRequest,
  limit = 10,
  windowMs = 60_000
): Promise<RateLimitResult> {
  const ip = extractClientIp(req);
  const pathname = new URL(req.url).pathname;
  return consumeBucket(ip, pathname, limit, windowMs);
}

/**
 * Per-account limiter for authenticated/sensitive actions (e.g. login attempts are
 * additionally throttled per account by lockout, but this caps spraying across IPs).
 */
export async function checkIdentityRateLimit(
  identity: string,
  scope: string,
  limit: number,
  windowMs = 60_000
): Promise<RateLimitResult> {
  return consumeBucket(identity, scope, limit, windowMs);
}
