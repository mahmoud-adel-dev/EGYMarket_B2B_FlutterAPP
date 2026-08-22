# Authorization Model

## Identity

Authentication is NextAuth **credentials** with encrypted, HttpOnly session cookies.
The JWT stores only the immutable `user.id` + `session_version`; every request
re-derives authorization from MongoDB so suspensions and role changes take effect
immediately. Bumping `session_version` (password reset, account deletion) invalidates
all existing sessions.

## Guard pipeline

Every protected API route is wrapped in `withAuth(allowedRoles, handler)`
(`backend/lib/auth/withAuth.ts`) which, in order:

1. Resolves the NextAuth session cookie → 401 if absent.
2. Loads the user from MongoDB → 401 if missing or `isActive=false`.
3. Enforces role allow-list → 403.
4. Loads organization via `user.organization_id`:
   - org inactive or `verification_status='suspended'` → 403,
   - active membership required → 403 otherwise.
5. Injects a normalized context `{userId, role, organizationId, memberRole}`.
6. Maps ZodError→400, ApiError→its status, everything else→sanitized 500; attaches
   `x-request-id`, writes structured JSON logs.

Admin pages/actions use `require_admin.ts` which re-validates from DB on every call.

## Roles

| Role | Scope | Notes |
|---|---|---|
| Admin | platform-wide | manages verification, disputes, plans, settings, users |
| Wholesaler | own organization | products, orders as seller, posts, dashboard |
| Retailer | own organization | cart, orders as buyer, follows, reviews |
| Shipper | own organization | shipping rates, assigned shipments |

Organization-level roles (`owner > manager > staff`) gate sensitive org mutations
(payment accounts, verification documents) on top of the global role.

## Tenant isolation rules

- Every document carries its organization reference (`organization_id`,
  `buyer_organization_id`, `payer_organization_id`, …). Queries filter by it —
  **never** by client-supplied IDs alone.
- Order access requires being buyer/seller/shipper org or admin.
- Notifications are scoped to `recipient_id`; conversations to participants;
  obligations to payer or beneficiary.
- Public wholesaler sub-resources (products/posts/reviews) intersect the requested
  organization with the verified+active set — an unverified/suspended merchant can
  never become browsable by passing their id.
- The Flutter client is never trusted for authorization or money: all prices, fees,
  shipping costs, and totals are computed server-side.

## Rate limiting

Fixed-window counters in Mongo (`RateLimit`, TTL cleanup), keyed by trust-model-aware
client IP + route scope:

| Surface | Limit |
|---|---|
| register | 5/min per IP |
| forgot/reset password, resend verification | 3–5 /15min per IP |
| login | 10/min per IP + per-account lockout after 5 failures (15 min) |
| verify-email token consumption | 10/min |
| upload | 15/min per IP |

Behind Caddy set `TRUST_PROXY_HEADERS=true` to use the real client address (last XFF
hop). Without it, limits fail closed into one shared bucket rather than trusting
spoofable headers.
