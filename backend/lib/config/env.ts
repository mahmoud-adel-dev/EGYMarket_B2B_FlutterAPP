/**
 * Production configuration validation. Fails fast on boot (health/ready and the
 * first guarded request both call `assertProductionConfig`) so a misconfigured
 * deployment never serves traffic with weak secrets.
 */
export interface ConfigIssue {
  variable: string;
  problem: string;
}

/**
 * Heuristic that flags low-entropy secrets — placeholder tokens, human-readable
 * phrases, and highly repetitive strings — that pass a naive length check but
 * would be trivially guessable if they reached production as a session-signing key.
 */
export function isLowEntropySecret(secret: string): boolean {
  const trimmed = secret.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  const placeholders = [
    'secret',
    'password',
    'auth_key',
    'authkey',
    'super_secret',
    'change_me',
    'changeme',
    'your-secret',
    'your_secret',
    'generate-a-random',
    'example',
    'xxxx',
  ];
  if (placeholders.some((token) => lower.includes(token))) return true;
  // Repeated single character (aaaaaaaa...) or alternating pair (ababab...).
  if (/(.)\1{6,}/.test(trimmed)) return true;
  if (/(.)(.)\1\2\1\2\1\2/.test(trimmed)) return true;
  return false;
}

export function collectConfigIssues(isProduction: boolean): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const secret = process.env.NEXTAUTH_SECRET || '';
  if (!process.env.MONGODB_URI) {
    issues.push({ variable: 'MONGODB_URI', problem: 'missing' });
  }
  if (!secret) {
    issues.push({ variable: 'NEXTAUTH_SECRET', problem: 'missing' });
  } else if (isProduction && secret.length < 32) {
    issues.push({ variable: 'NEXTAUTH_SECRET', problem: 'must be at least 32 random characters in production' });
  } else if (isProduction && isLowEntropySecret(secret)) {
    // S-2: reject guessable/predictable secrets (human phrases, placeholders,
    // repeated characters) so a leaked or trivial value can never sign session JWTs.
    issues.push({ variable: 'NEXTAUTH_SECRET', problem: 'is predictable/low-entropy; generate with openssl rand -base64 48' });
  }
  if (!process.env.NEXTAUTH_URL && !process.env.APP_ORIGIN && isProduction) {
    issues.push({ variable: 'NEXTAUTH_URL', problem: 'required in production for secure cookies/callbacks' });
  }
  return issues;
}

/** Throws when production-critical configuration is unsafe. No-ops in development. */
export function assertProductionConfig(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const issues = collectConfigIssues(true);
  if (issues.length) {
    // Log structured diagnostics without printing any secret values.
    console.error(JSON.stringify({
      level: 'fatal',
      msg: 'invalid_production_config',
      issues,
    }));
    throw new Error(`Invalid production configuration: ${issues.map((i) => `${i.variable} (${i.problem})`).join('; ')}`);
  }
}
