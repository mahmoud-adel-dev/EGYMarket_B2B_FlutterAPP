export interface CorsOriginConfig {
  nodeEnv?: string;
  appOrigin?: string;
  appOrigins?: string;
}

function normalizeOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '[::1]'
      || hostname === '::1';
  } catch {
    return false;
  }
}

/**
 * Allows explicitly configured first-party origins in every environment.
 * During local development only, Flutter Web may choose a random port, so any
 * loopback origin is accepted. Production never receives this exception.
 */
export function isCorsOriginAllowed(
  requestOrigin: string | null,
  config: CorsOriginConfig,
): boolean {
  const normalizedRequestOrigin = normalizeOrigin(requestOrigin || undefined);
  if (!normalizedRequestOrigin) return false;

  const configuredOrigins = [
    config.appOrigin,
    ...(config.appOrigins || '').split(','),
  ]
    .map(normalizeOrigin)
    .filter((origin): origin is string => Boolean(origin));

  if (configuredOrigins.includes(normalizedRequestOrigin)) return true;

  return config.nodeEnv !== 'production'
    && isLoopbackOrigin(normalizedRequestOrigin);
}
