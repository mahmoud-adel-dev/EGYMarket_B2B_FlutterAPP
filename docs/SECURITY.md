# Security

## Hardening applied in this transformation

### Authentication & sessions
- Encrypted HttpOnly NextAuth cookies; `useSecureCookies` in production.
- Session versioning: password reset / deletion bumps `session_version`, instantly
  invalidating old cookies. Every request re-validates user + role + org state from DB.
- Login brute force: per-IP fixed-window limit (10/min) **plus** per-account lockout
  after 5 failures for 15 minutes, enforced with an atomic `$inc` pipeline update
  (parallel attempts each count exactly once).
- bcrypt cost ≥10 hashing; demo credentials are guarded (see below).

### Transport & headers
- Caddy terminates TLS with HSTS (`max-age=31536000; includeSubDomains`) on both domains.
- Baseline CSP scoped to `/admin/*`; X-Frame-Options DENY, nosniff, strict Referrer-Policy,
  restrictive Permissions-Policy. `X-Powered-By` disabled.
- Admin external links use `rel="noopener noreferrer"`.
- Flutter release builds enforce certificate pinning against pinned SPKIs.

### Input & upload safety
- Zod validation on every mutating endpoint; pagination clamped (NaN/negative-proof).
- All `$regex` built from user input passes `escapeRegExp` (ReDoS prevention).
- Uploads: MIME allow-lists, size caps, **magic-byte sniffing** of decoded content —
  the declared type is never trusted alone.
- Caddy enforces a request body ceiling on the API domain.

### Rate limiting trust model
`TRUST_PROXY_HEADERS=true` uses the last `X-Forwarded-For` hop (the address Caddy
observed). Without it the limiter fails closed into a shared bucket instead of trusting
attacker-writable headers.

### Multi-tenancy
Tenant isolation is enforced server-side on every protected read/write; public
wholesaler sub-resources intersect with the verified+active set so suspended merchants
cannot be reached through any door.

### Secrets
- `.env*` files are gitignored; only `*.example` templates live in the repo.
- Startup validation (`assertProductionConfig`) refuses production boot with weak/missing
  `NEXTAUTH_SECRET` or missing Mongo URI.
- The maintenance cron secret requires ≥32 chars and timing-safe comparison.
- Demo seeding refuses non-local databases unless `ALLOW_DEMO_SEED=true`.

## Incident history to act on

`docs/PRODUCTION_RUNBOOK.md` records that MongoDB connection data leaked during
development via an ad-hoc scratch script. **Treat those credentials as burned**: rotate
the Atlas user password and Cloudinary API keys before go-live, then confirm no clone
or image retains them.

## Known limitations

- CSP allows `'unsafe-inline'` styles/scripts where React SSR requires it.
- No automated dependency scanning beyond `npm audit --audit-level=high` in CI.
- Push notification transport intentionally disabled (MongoDB-only MVP).
