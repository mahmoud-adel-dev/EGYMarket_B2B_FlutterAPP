/**
 * Production configuration validation. Fails fast on boot (health/ready and the
 * first guarded request both call `assertProductionConfig`) so a misconfigured
 * deployment never serves traffic with weak secrets.
 */
export interface ConfigIssue {
  variable: string;
  problem: string;
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
