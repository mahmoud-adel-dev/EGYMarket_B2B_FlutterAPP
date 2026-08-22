/**
 * Escape a string for safe interpolation inside a RegExp.
 * Every `$regex` built from user-controlled input must pass through this helper —
 * raw interpolation allows ReDoS patterns like `(a+)+$`.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build an anchored, case-insensitive exact-match regex from user input. */
export function anchoredExactRegExp(value: string): RegExp {
  return new RegExp(`^${escapeRegExp(value)}$`, 'i');
}

/** Build a case-insensitive "contains" regex from user input. */
export function containsRegExp(value: string): RegExp {
  return new RegExp(escapeRegExp(value), 'i');
}
