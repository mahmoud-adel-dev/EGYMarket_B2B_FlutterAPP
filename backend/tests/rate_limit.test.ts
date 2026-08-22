import { describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * extractClientIp/buildRateLimitKey are pure functions; they are imported without
 * triggering the module's MongoDB dependency because the DB is only touched inside
 * checkRateLimit/consumeBucket.
 */
const { extractClientIp, buildRateLimitKey } = await import('../lib/auth/rate_limit');

function fakeReq(headers: Record<string, string>): NextRequest {
  return { headers: new Headers(headers) } as unknown as NextRequest;
}

describe('extractClientIp trust model (P0-2)', () => {
  it('collapses all identities when proxy headers are untrusted (fail closed)', () => {
    const original = process.env.TRUST_PROXY_HEADERS;
    delete process.env.TRUST_PROXY_HEADERS;
    const a = extractClientIp(fakeReq({ 'x-forwarded-for': '1.2.3.4' }));
    const b = extractClientIp(fakeReq({ 'x-forwarded-for': '5.6.7.8' }));
    expect(a).toBe(b);
    process.env.TRUST_PROXY_HEADERS = original;
  });

  it('uses the LAST x-forwarded-for hop behind a trusted proxy', () => {
    process.env.TRUST_PROXY_HEADERS = 'true';
    const ip = extractClientIp(fakeReq({ 'x-forwarded-for': 'spoofed.attacker.ip, 203.0.113.9' }));
    expect(ip).toBe('203.0.113.9');
    delete process.env.TRUST_PROXY_HEADERS;
  });

  it('normalizes IPv6-mapped IPv4 addresses', () => {
    process.env.TRUST_PROXY_HEADERS = 'true';
    const ip = extractClientIp(fakeReq({ 'x-forwarded-for': '::ffff:203.0.113.9' }));
    expect(ip).toBe('203.0.113.9');
    delete process.env.TRUST_PROXY_HEADERS;
  });
});

describe('buildRateLimitKey', () => {
  it('separates buckets by identity, scope and window', () => {
    const base = buildRateLimitKey('1.1.1.1', '/api/auth/register', 100);
    expect(base).not.toBe(buildRateLimitKey('2.2.2.2', '/api/auth/register', 100));
    expect(base).not.toBe(buildRateLimitKey('1.1.1.1', '/api/upload', 100));
    expect(base).not.toBe(buildRateLimitKey('1.1.1.1', '/api/auth/register', 101));
    // Deterministic within the same window.
    expect(base).toBe(buildRateLimitKey('1.1.1.1', '/api/auth/register', 100));
  });
});
