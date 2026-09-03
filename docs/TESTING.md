# SEALS Testing Guide

Last verified: **2026-08-29**.

This document separates fast unit checks, disposable MongoDB integration tests,
optional external replica-set tests, Flutter checks, and release builds.

## Backend

Run from `backend/`:

```powershell
npm ci
npm run lint
npm test
npm run typecheck:integration
npm run test:integration
npm audit --audit-level=high
npm run build
```

`npm run lint` is the strict TypeScript `tsc --noEmit` gate. The fast Vitest
suite contains **57 unit tests across 10 files** covering order rules, disputes,
chat access, pricing, environment validation, pagination, validation, and rate
limiting.

### MongoDB integration and chaos suite

`npm run test:integration` starts a real, disposable MongoDB replica set through
`mongodb-memory-server`. It uses the MongoDB driver, Mongoose schemas, indexes,
transactions, and the production order service; it does not mock persistence.

The **7 integration tests** cover:

- concurrent idempotent order creation;
- inventory reservation and exact payment-obligation creation;
- proof/confirmation progression from `awaiting_payments` to `preparing`;
- exactly-once inventory commit on duplicate receipt confirmation;
- transaction rollback for partial multi-product reservation failures;
- rollback when beneficiary payment accounts are missing;
- orphan reservation recovery, oversell prevention, and configurable purchase
  chaos with duplicate cancellation/receipt races.

Useful commands:

```powershell
# Full disposable replica-set suite
npm run test:integration

# Only the configurable purchase-chaos scenario
$env:PURCHASE_CHAOS_ROUNDS='5'
$env:PURCHASE_CHAOS_CONCURRENCY='40'
npm run test:integration:chaos
```

### External MongoDB/Atlas test execution

Copy `.env.integration.example` only for a dedicated, disposable test replica
set. The harness creates a run-specific database and drops it afterwards.

```powershell
$env:MONGODB_TEST_URI='mongodb://HOST/seals_integration_test?replicaSet=rs0'
$env:MONGODB_TEST_ALLOW_EXTERNAL='I_UNDERSTAND_THIS_DROPS_TEST_DATA'
npm run test:integration:live
```

Safety rules fail closed:

- `NODE_ENV=production` is rejected;
- the URI must include a database name containing `test`, `integration`, `ci`,
  or `chaos`;
- `admin`, `config`, `local`, `prod`, and `production` are forbidden;
- the test URI cannot equal `MONGODB_URI`;
- the explicit destructive-test confirmation is mandatory.

Never point this command at production or a shared staging database.

## Flutter

Run from `app/`:

```powershell
flutter pub get
dart format --output=none --set-exit-if-changed .
flutter analyze
flutter test
flutter build web --release
```

The verified Flutter suite contains **32 tests**. In addition to API selection,
cart persistence, cookie handling, lifecycle safety, order parsing, upload
validation, and shared widgets, it now enforces design-system contracts:

- Arabic text does not receive Latin character tracking;
- email, phone, number, URL, and password values remain LTR;
- primary controls preserve a 48px minimum touch target;
- shared horizontal spacing uses directional primitives.

Android/iOS release instructions are in
[`app/docs/RELEASE_BUILD.md`](../app/docs/RELEASE_BUILD.md).

## Standalone admin panel

Run from `admin-panle/`:

```powershell
npm ci
npm run lint
npm run build
```

The standalone panel currently has compile/build gates but no dedicated unit
test suite.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request:

1. Backend dependency audit, typecheck, 57 unit tests, integration typecheck,
   MongoDB/chaos suite, and production build.
2. Flutter format check, analyze, 32 tests, and Web release build.
3. Standalone admin dependency audit, typecheck, and production build.
4. On pushes, Compose validation and API/Flutter Docker image builds.

The MongoDB binary cache keeps CI repeat runs practical while every test run
still receives a fresh database.

## Remaining external/E2E validation

The automated suite does not replace:

- an HTTP-level authenticated purchase flow against a deployed staging stack;
- Flutter device E2E automation across buyer, wholesaler, and shipper accounts;
- real SMTP, Cloudinary, InstaPay/wallet proof, and notification delivery checks;
- iOS archive/signing verification on the owning macOS/Xcode environment;
- legal, accounting, and operational pilot acceptance.
