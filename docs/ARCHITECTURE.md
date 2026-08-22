# Architecture

## System overview

```
Flutter (Android/iOS/Web)
        │  HTTPS — NextAuth HttpOnly session cookies
        ▼
     Caddy ── TLS termination, headers, compression, body limits
      │            │
      │ APP_DOMAIN │ API_DOMAIN
      ▼            ▼
 nginx :8080   Next.js 16 (standalone) :3000
 (Flutter Web    ├─ /api/** Route Handlers (modular monolith modules)
  SPA)           ├─ /admin  server-rendered dashboard
                 └─ proxy.ts CORS origin allow-list
                        │
                        ▼
                 MongoDB Atlas (replica set → multi-document transactions)

External: Cloudinary (media CDN, signed uploads), SMTP (verification/reset mail)
```

## Backend layering

```
Route Handler (app/api/**/route.ts)      HTTP shape only
   ↓ withAuth guard                      authn + RBAC + org/membership state
   ↓ Zod schemas (lib/validation/*)      input contracts
   ↓ Application services (lib/*_service) workflows, transactions
   ↓ Domain rules (lib/orders/order_rules) pure decision tables
   ↓ Models (models/*)                   Mongoose schemas + indexes
MongoDB
```

Rules:

- No route writes `order.status` outside the order service.
- No monetary amount is ever read from a request body.
- Cross-document consistency uses conditional single-statement updates as race gates,
  wrapped in transactions where the topology supports them (`runInTransaction`).
- Shared helpers: pagination clamping (`lib/api/pagination.ts`), regex escaping
  (`lib/utils/regexp.ts`), error mapping (`lib/api/responses.ts`).

Modules: auth · users · organizations · subscriptions · products · cart · orders ·
payments · shipping · conversations · notifications · social (posts/follows/ratings) ·
analytics · administration · audit.

## Flutter client

Feature-first layout; each feature owns `data/` (models/services),
`presentation/cubit/` (state), `presentation/screens|widgets`.

- **DI**: `core/di/service_locator.dart` provides process-wide storage + network.
- **Networking**: single `NetworkManager` over Dio — SSL pinning in release builds,
  NextAuth cookie persistence on native platforms, domain exception mapping, dev-only
  scrubbed logs.
- **Auth**: root `AuthCubit`; transient network failures during restore keep the
  persisted session and offer retry instead of logging out.
- **Design system**: `core/theme/app_theme.dart` + `core/theme/app_tokens.dart`
  (spacing/radius/durations/breakpoints); shared widgets in `core/widgets/`.
- **Money**: piasters everywhere end-to-end; display via `PriceFormatter` (EGP).
- **Localization**: easy_localization (en/ar, RTL-aware); new UI must use keys.

## Realtime posture

Conversations and notifications use deliberate polling. The data model (conversation
participants, message read receipts, notification recipients) is already shaped for a
future WebSocket/SSE layer; the polling services are the seam to replace. No fragile
half-realtime layer is introduced before core hardening is complete.
