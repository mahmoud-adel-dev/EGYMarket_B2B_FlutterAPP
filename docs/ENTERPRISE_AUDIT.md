# SEALS Enterprise Audit (Phase 0 — Forensic Review)

Audit date: 2026-08-21. Scope: full repository — Flutter client (`app/`), Next.js API/Admin (`backend/`),
infrastructure (Docker, Caddy, CI), docs, and scripts. Findings are classified:

- **P0 Critical** — data/security integrity, money, inventory, tenant isolation.
- **P1 High** — functional correctness, abuse resistance, reliability.
- **P2 Medium** — production hardening, consistency, performance.
- **P3 Improvement** — hygiene, UX polish, maintainability.

Each finding lists problem → affected files → risk → solution → status.

---

## P0 — Critical

### P0-1 Order lifecycle mutations are not atomic across inventory + obligations + status
- **Problem:** The accept flow (`reserveOrderInventory` → `createOrderPaymentObligations` → `order.save()`)
  spans multiple documents without a transaction. Two concurrent `confirm_receipt` calls both pass the
  state check and both execute unconditional `$inc {stock_quantity:-q, reserved_quantity:-q}` before either
  save lands (optimistic concurrency rejects only the second *save*, not the stock writes) → permanent stock
  loss. Racing cancels double-release reservations; racing accepts can leak a reservation when obligation
  insertion fails after reservation.
- **Affected:** `backend/app/api/orders/[id]/status/route.ts`, `backend/lib/orders/order_service.ts`.
- **Risk:** Inventory corruption, overselling, financial inconsistency under retries/double-taps.
- **Solution:** Single-statement conditional transitions (`findOneAndUpdate({_id, status: X}, …)`) as the
  race gate; inventory effects applied exactly once, guarded by transition win + `inventory_committed`
  flags; wrap critical multi-document flows in MongoDB transactions with automatic fallback for standalone
  dev deployments; idempotent obligation creation via the existing `{order_id, kind}` unique index.
- **Status:** ✅ Fixed (see `lib/db/transaction.ts`, rewritten `order_service.ts`, status route).

### P0-2 Rate-limit identity is client-controlled
- **Problem:** `checkRateLimit` trusts the first `x-forwarded-for` entry, which an attacker supplies
  whenever the app is directly reachable or behind a non-scrubbing proxy. Rotating the header defeats every
  IP-based limit.
- **Affected:** `backend/lib/auth/rate_limit.ts`.
- **Risk:** Brute force / DoS protection fully bypassable.
- **Solution:** Trust-model-aware extraction (`TRUST_PROXY_HEADERS`): last-hop XFF behind a trusted proxy,
  otherwise socket-derived address; documented deployment requirement (Caddy sets the real client IP).
- **Status:** ✅ Fixed.

### P0-3 Dispute creation bypasses the order state machine
- **Problem:** `POST /api/orders/[id]/disputes` wrote `order.status='disputed'` directly with no
  `isOrderActionAllowed` check and no status guard — disputes could be opened on `requested`, `preparing`,
  or even `completed` orders, retroactively freezing confirmed obligations. Duplicated the sanctioned
  `open_dispute` action in the status route.
- **Affected:** `backend/app/api/orders/[id]/disputes/route.ts`, `lib/orders/order_rules.ts`.
- **Risk:** Funds stranded, seller payouts frozen, inconsistent history.
- **Solution:** Disputes route delegates to the same guarded service path used by the status route;
  dispute opening allowed only from active fulfillment states.
- **Status:** ✅ Fixed.

### P0-4 `disputed` was a terminal state — no exit transitions existed
- **Problem:** After admin dispute resolution, the Order stayed `disputed` forever; obligations stayed
  `disputed`; reserved inventory never released; no refund path.
- **Affected:** `lib/orders/order_rules.ts`, `app/api/admin/disputes/[id]/review/route.ts`,
  `lib/orders/order_service.ts`.
- **Risk:** Permanent dead-end in the money/inventory path.
- **Solution:** Added admin-only resolution actions `resolve_dispute_complete` (resume/complete, commit
  inventory, restore obligations to `confirmed`) and `resolve_dispute_cancel` (cancel, release reserved
  stock, move disputed/confirmed obligations to `refund_pending`). Wired into the admin dispute review
  route.
- **Status:** ✅ Fixed.

### P0-5 Flutter Web declared but not deployed anywhere in production
- **Problem:** Backend CORS/config assume a browser origin (`APP_ORIGIN=https://app.example.com`), yet no
  compose service, Dockerfile, Caddy site, or CI step produces/serves a web build.
- **Affected:** root `docker-compose.yml`, `Caddyfile`, `.github/workflows/ci.yml`, `.env.production.example`.
- **Risk:** A required product surface silently missing in production.
- **Solution:** Added multi-stage `app/Dockerfile` (Flutter release web build → nginx SPA server),
  `web` compose service, dual-domain Caddy routing, CI `flutter build web --release`.
- **Status:** ✅ Fixed.

### P0-6 Live-looking credentials present in local `backend/.env`
- **Problem:** Working tree contained a MongoDB Atlas URI with credentials, Cloudinary API secret, and a
  weak guessable `NEXTAUTH_SECRET`. `docs/PRODUCTION_RUNBOOK.md` itself records that connection data leaked
  during development once already.
- **Affected:** `backend/.env` (not committed by ignore rules, but present locally).
- **Risk:** Full database/media compromise if this machine/image is shared.
- **Solution:** Treat as burned: rotate Atlas user password, rotate Cloudinary keys, generate a fresh 32-byte
  `NEXTAUTH_SECRET`. Added startup env validation that refuses weak/missing secrets in production and a
  complete `.env.example` set.
- **Status:** ⚠️ PARTIAL — code-side validation implemented; credential rotation requires the operator
  (external action, cannot be done from the repo).

## P1 — High

| ID | Finding | Affected | Risk | Solution | Status |
|----|---------|----------|------|----------|--------|
| P1-1 | Public posts filter override exposed unverified/suspended wholesalers' posts (`filter.organization_id = wholesalerId` replaced the verified `$in`) | `app/api/posts/route.ts` | Suspended merchants browsable | Intersect requested org with verified set | ✅ Fixed |
| P1-2 | Regex injection/ReDoS in `posts` search and `feed` governorate | `posts/route.ts`, `feed/route.ts` | CPU DoS | Shared `escapeRegExp` helper used everywhere | ✅ Fixed |
| P1-3 | Unbounded queries (disputes list, dashboard aggregation, org products, wholesaler sub-resources, comments, ratings, follows, conversations + N+1 unread counts, notifications unclamped limit, feed/posts negative page) | many routes | Memory DoS, data dumps | Central pagination parser (clamped page/limit) + hard caps on collection scans | ✅ Fixed |
| P1-4 | Bare `Schema.parse` with no try/catch turned malformed bodies into HTTP 500 | `auth/reset-password`, `auth/forgot-password`, `auth/resend-verification`, `subscriptions/invoices/[id]/proof` | Wrong status codes, noisy errors | Wrapped in safe handlers / ApiError mapping | ✅ Fixed |
| P1-5 | Raw `error.message` echoed to clients (bypasses guard sanitization) | `auth/me`, `upload`, `auth/register`, `posts`, `feed`, `ratings`, `comments`, `notifications` | Info leak | Centralized error response helpers | ✅ Fixed |
| P1-6 | Upload validated by declared MIME only; huge base64 JSON bodies; no dimension caps | `app/api/upload/route.ts`, `lib/media/cloudinary.ts` | Storage/memory abuse | Magic-byte sniffing for images/video containers, stricter size caps, JSON body size guard | ✅ Improved |
| P1-7 | `verify-email` had no rate limit | `auth/verify-email/route.ts` | Token spam | Rate limit added | ✅ Fixed |
| P1-8 | No per-IP throttle on login; lockout counter read-modify-write race | `lib/auth/authOptions.ts` | Password spraying | Per-IP login rate limit inside credentials authorize; atomic `$inc` pipeline update for lockout | ✅ Fixed |
| P1-9 | Lazy org auto-provisioning executed inside read paths (`session` callback + `withAuth`) — concurrent first requests could create duplicate orgs; ~2× DB reads per request | `organization_service.ts`, `withAuth.ts`, `authOptions.ts` | Data duplication, latency | Provisioning moved to register/login only; guards read `user.organization_id` directly | ✅ Fixed |
| P1-10 | Seed script has no environment guard and upserts verified orgs with a public demo password | `scripts/seed-mvp.mjs` | One accidental run poisons prod | Refuse when `NODE_ENV=production` or non-local URI unless `ALLOW_DEMO_SEED=true` | ✅ Fixed |
| P1-11 | Payment proof accepted regardless of order state/deadline; subscription proof flipped subscription to `under_review` unconditionally | `orders/[id]/payments/[paymentId]/proof`, `subscriptions/invoices/[id]/proof` | Stale payments accepted | Order-status/deadline guards; subscription state guards | ✅ Fixed |

## P2 — Medium

| ID | Finding | Status |
|----|---------|--------|
| P2-1 NaN pagination (`page=abc`) → driver error → 500 (`orders`, `users`, `wholesalers`, `organizations`) | ✅ Fixed (central parser) |
| P2-2 Like counter / cart read-modify-write races → atomic `$inc` driven by unique-index outcome | ✅ Fixed (likes); cart acceptable risk (single-user doc, low stakes) — documented |
| P2-3 Registration E11000 email race → 500 instead of 409; orphan-user edge | ✅ Fixed (duplicate-key mapping + transactional provisioning where available) |
| P2-4 Missing audit logs: verification review, platform settings changes, invoice reviews, order administrative overrides; no ip/userAgent captured | ✅ Fixed (wired into all admin mutations; request context captured where available) |
| P2-5 Public wholesaler sub-resources (`products/posts/reviews`) skipped verification gating | ✅ Fixed (verified-org gate applied) |
| P2-6 Duplicated schemas/logic: payment-account validators ×3, read-all ×2, piaster conversion ×3, order-participant check ×4, private escapeRegExp | ✅ Consolidated |
| P2-7 Dispute reviews left no audit trail in admin server actions | ✅ Fixed |
| P2-8 No CSP; admin external links missing `rel="noopener"` | ✅ Fixed (baseline CSP + noopener) |
| P2-9 Maintenance jobs have no overlap lock | ✅ Fixed (in-progress lock document) |
| P2-10 `npm run lint` = typecheck only; no ESLint | ⚠️ PARTIAL (kept typecheck gate; ESLint config added if toolchain permits — see report) |
| P2-11 Backup script passes Mongo URI on command line | ✅ Fixed (env var consumption) |
| P2-12 Empty `backend/scratch/` directory (post-credential-leak remnant) | ✅ Removed |

## P3 — Improvements

- Flutter: singletons constructed ad-hoc per screen (~15 sites) → central DI injector. ✅
- Flutter: AuthCubit recreated on shell rebuild → hoisted at app root. ✅
- Flutter: SSL pinning disabled silently for any URL mismatch → fail-closed in release builds. ✅
- Flutter: session cookie cleared on ANY network error during restore → cleared only on definitive 401. ✅
- Flutter: prices rendered as `$12.34` (dollar sign) in product cards → unified EGP formatting. ✅
- Flutter: duplicated media carousel ×3, base64 upload builder ×6, error-retry UI ×8, divergent governorate lists → shared widgets/constants. ✅
- Flutter: shipper dashboard was a placeholder wrapper → real shipper operations screen. ✅
- Localization coverage low (~62 `tr()` vs ~237 hardcoded literals) → key flows migrated; remaining debt tracked in report. ⚠️ PARTIAL
- Design system lacked spacing/radius/duration tokens → token classes added and applied. ✅
- Backend: fabricated `expires` in normalized session object removed. ✅

## Verification commands actually run

See `docs/ENTERPRISE_TRANSFORMATION_REPORT.md` §14 for exact commands and results recorded at the end of
the transformation. Nothing in this document is marked "Fixed" without the corresponding change landing in
the tree.
