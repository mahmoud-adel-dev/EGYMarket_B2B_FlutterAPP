# SEALS Testing Guide

What is automated today, how to run it, and the known gaps.

## Backend — `backend/`

### Commands

```powershell
cd backend
npm ci
npm run lint    # tsc --noEmit (typecheck; this project's "lint" script)
npm test        # vitest run (unit tests)
npm run build   # next build (standalone production build)
```

There is no separate ESLint config; `npm run lint` is a TypeScript compile check (`backend/package.json`).

### Unit tests (`vitest`)

Configured in `backend/vitest.config.ts`: `environment: 'node'`, alias `@` → repo backend root, setup file `tests/setup.ts`.

`backend/tests/setup.ts` sets a dummy `MONGODB_URI` (`mongodb://127.0.0.1:27017/seals_test`) and `NODE_ENV=test` because the Mongoose connection module validates the variable at import time. **Unit tests never open a real MongoDB connection** — they exercise pure logic modules only.

| File | Covers |
| --- | --- |
| `tests/order_rules.test.ts` | Order state machine + participant authorization: who may accept/reject/transition, per fulfillment method, per status. |
| `tests/order_rules_disputes.test.ts` | Dispute rules: only Admin can exit the `disputed` state (`resolve_dispute_complete/cancel`), dispute resolution rejected on non-disputed orders, opening eligibility (e.g. buyers cancel `requested` orders instead of disputing). |
| `tests/pricing.test.ts` | Wholesale tier pricing (`unitPriceForQuantity`): highest eligible tier wins regardless of input order, base price below first tier, legacy EGP float prices converted to integer piasters as migration fallback. |
| `tests/rate_limit.test.ts` | Rate-limit trust model: with `TRUST_PROXY_HEADERS` unset every caller collapses into one shared bucket (fail closed against header spoofing); bucket key hashing (`buildRateLimitKey`). |
| `tests/validation.test.ts` | Zod schemas: registration (strong password, explicit terms acceptance, email normalization), order creation, payment proof submission, product creation. |
| `tests/api_helpers.test.ts` | `parsePagination` clamping (garbage input falls back to defaults instead of NaN; limit capped at 100; negative pages floored so `skip` is never negative) and regex helpers (`escapeRegExp`, `anchoredExactRegExp`, `containsRegExp`) used for user-supplied search filters. |

## Flutter app — `app/`

### Commands

```powershell
cd app
flutter pub get
flutter analyze
dart format --output=none --set-exit-if-changed .
flutter test
flutter build web --release      # requires API_BASE_URL_PROD in app/.env
```

### Test suites (`app/test/`)

| File | Covers |
| --- | --- |
| `api_constants_test.dart` | Environment-driven API base URL resolution: development uses `API_BASE_URL_LOCAL`; release/production requires `API_BASE_URL_PROD` and throws when missing or localhost. |
| `local_cart_service_test.dart` | Guest/local cart persistence via SharedPreferences: products and quantities survive restarts, merge behavior on login sync. |
| `nextauth_cookie_interceptor_test.dart` | Cookie interceptor captures NextAuth/Auth.js cookies (`next-auth.session-token`, `authjs.*`) while ignoring unrelated cookies, and merges cookie headers correctly across requests. |
| `governorates_test.dart` | Governorate single source of truth: exactly 27 unique Egyptian governorates and the register screen aliases the canonical list (no divergent copy). |
| `core_utils_test.dart` | Price formatter (piasters rendered as EGP with two decimals — EGP-currency guard) and media upload payload validation. |
| `shared_widgets_test.dart` | Shared widgets: `ErrorRetryView` message + retry callback, `MediaCarousel` rendering. |

## CI (`.github/workflows/ci.yml`)

Every push/pull request runs:

1. **backend job**: `npm ci`, dependency audit (`npm audit --audit-level=high`), typecheck, unit tests, production build (with dummy non-secret env values).
2. **flutter job**: `pub get`, format check (`dart format --set-exit-if-changed`), copy `.env.example`, `flutter analyze`, `flutter test`, release web build.
3. **docker job** (pushes only): `docker compose config -q` validation plus builds of both Docker images (web built with a placeholder `API_BASE_URL_PROD`).

## What is NOT yet automated

- **Integration testing against a real database.** All backend tests are pure unit tests; no suite starts MongoDB, so Mongoose schemas, indexes, transactions, and route handlers are exercised only in production-like manual checks.
- **Driver-level concurrency tests.** Critical invariants (stock reservation vs oversell, unique like index, maintenance lock, cart/order races) are guarded by atomic operations but have no automated concurrent-execution coverage.
- **HTTP-layer tests.** Routes are not tested through a server (no supertest-style harness); auth guards and error envelopes are verified indirectly.
- **Flutter widget/E2E flows.** No integration tests driving full screens or an end-to-end purchase path.

### Recommended next steps

1. Add a **MongoDB service container** to CI (GitHub Actions service) plus an integration suite that runs route handlers against a throwaway database — start with order creation, payment proof review, and subscription expiry paths.
2. Add **driver-level concurrency tests**: parallel stock-consuming order requests asserting exactly `stock_quantity - reserved_quantity` succeed, and concurrent like/maintenance runs asserting counters and locks never drift.
3. Add a minimal end-to-end smoke script (register → verify → order → pay → resolve) against a staging deployment.
