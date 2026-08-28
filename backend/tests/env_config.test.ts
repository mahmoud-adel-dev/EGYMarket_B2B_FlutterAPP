import { describe, it, expect, afterEach } from 'vitest';
import { isLowEntropySecret, collectConfigIssues } from '@/lib/config/env';

describe('isLowEntropySecret', () => {
  it('rejects placeholder and human-readable secrets', () => {
    expect(isLowEntropySecret('b2b_marketplace_super_secret_auth_key_2026')).toBe(true);
    expect(isLowEntropySecret('change_me_please_secure_this_now')).toBe(true);
    expect(isLowEntropySecret('secretsecretsecretsecretsecret')).toBe(true);
    expect(isLowEntropySecret('generate-a-random-secret-of-at-least-32-bytes')).toBe(true);
  });

  it('rejects highly repetitive secrets', () => {
    expect(isLowEntropySecret('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(true);
    expect(isLowEntropySecret('abababababababababababababababab')).toBe(true);
  });

  it('accepts a random high-entropy base64 secret', () => {
    expect(isLowEntropySecret('x9KpQ2+4mZvL8sWt1rNcB3fGjH6kYdUeOiAaRs')).toBe(false);
  });
});

describe('collectConfigIssues', () => {
  afterEach(() => {
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.MONGODB_URI;
    delete process.env.NEXTAUTH_URL;
    delete process.env.APP_ORIGIN;
  });

  it('flags a missing secret', () => {
    process.env.MONGODB_URI = 'mongodb://x';
    const issues = collectConfigIssues(true);
    expect(issues.some((i) => i.variable === 'NEXTAUTH_SECRET')).toBe(true);
  });

  it('flags a low-entropy secret in production', () => {
    process.env.MONGODB_URI = 'mongodb://x';
    process.env.NEXTAUTH_SECRET = 'b2b_marketplace_super_secret_auth_key_2026';
    const issues = collectConfigIssues(true);
    const secretIssue = issues.find((i) => i.variable === 'NEXTAUTH_SECRET');
    expect(secretIssue?.problem).toContain('low-entropy');
  });

  it('does not flag low-entropy secret in development', () => {
    process.env.MONGODB_URI = 'mongodb://x';
    process.env.NEXTAUTH_SECRET = 'b2b_marketplace_super_secret_auth_key_2026';
    const issues = collectConfigIssues(false);
    const secretIssue = issues.find((i) => i.variable === 'NEXTAUTH_SECRET');
    expect(secretIssue).toBeUndefined();
  });

  it('accepts a strong secret in production when other config is present', () => {
    process.env.MONGODB_URI = 'mongodb://x';
    process.env.NEXTAUTH_SECRET = 'x9KpQ2+4mZvL8sWt1rNcB3fGjH6kYdUeOiAaRs';
    process.env.NEXTAUTH_URL = 'https://api.example.com';
    const issues = collectConfigIssues(true);
    expect(issues.some((i) => i.variable === 'NEXTAUTH_SECRET')).toBe(false);
  });
});
