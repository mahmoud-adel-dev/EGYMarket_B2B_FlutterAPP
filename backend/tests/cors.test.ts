import { describe, expect, it } from 'vitest';
import { isCorsOriginAllowed } from '@/lib/http/cors';

describe('isCorsOriginAllowed', () => {
  it('allows random Flutter Web loopback ports in development', () => {
    expect(isCorsOriginAllowed('http://localhost:50144', {
      nodeEnv: 'development',
      appOrigin: 'http://localhost:5173',
    })).toBe(true);

    expect(isCorsOriginAllowed('http://127.0.0.1:61234', {
      nodeEnv: 'development',
    })).toBe(true);
  });

  it('does not mistake a lookalike host for loopback', () => {
    expect(isCorsOriginAllowed('http://localhost.evil.example:50144', {
      nodeEnv: 'development',
    })).toBe(false);
  });

  it('allows only configured origins in production', () => {
    const config = {
      nodeEnv: 'production',
      appOrigin: 'https://app.example.com/',
      appOrigins: 'https://admin.example.com, invalid-origin',
    };

    expect(isCorsOriginAllowed('https://app.example.com', config)).toBe(true);
    expect(isCorsOriginAllowed('https://admin.example.com', config)).toBe(true);
    expect(isCorsOriginAllowed('http://localhost:50144', config)).toBe(false);
    expect(isCorsOriginAllowed('https://evil.example.com', config)).toBe(false);
  });

  it('rejects missing and unsupported origins', () => {
    expect(isCorsOriginAllowed(null, { nodeEnv: 'development' })).toBe(false);
    expect(isCorsOriginAllowed('file:///tmp/client.html', {
      nodeEnv: 'development',
    })).toBe(false);
  });
});
