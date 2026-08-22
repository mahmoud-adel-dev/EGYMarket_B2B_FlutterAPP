# SEALS API Reference Summary

Base URL: `https://<API_DOMAIN>/api` (local dev: `http://localhost:3000/api`).
Implementation: Next.js App Router route handlers under `backend/app/api/`.

Source of truth for this document: repository inspection of `backend/app/api/**/route.ts`, `backend/lib/auth/withAuth.ts`, and `backend/lib/api/responses.ts`.

## Conventions

- **Success**: `{ "success": true, ...payload }`.
- **Errors**: `{ "error": "<code>", "message": "<human text>", "details?": [...] }`. Zod validation failures are HTTP 400 with `details` containing Zod issues (`backend/lib/api/responses.ts`). Internal error details are never echoed to clients in production.
- **`x-request-id` header**: every response from routes guarded by `withAuth` carries a UUID request id (`backend/lib/auth/withAuth.ts:119`) that also appears in structured JSON logs.
- **Rate limiting**: public sensitive endpoints return HTTP 429 with a `Retry-After` header. Identity comes from the last `X-Forwarded-For` hop when `TRUST_PROXY_HEADERS=true`; otherwise all callers share one bucket (fail closed) — see `backend/lib/auth/rate_limit.ts`.
- **Auth model**: NextAuth credentials provider with JWT sessions in HttpOnly cookies. Route guards re-derive role/org/membership from MongoDB on every request — cookie claims are never trusted.

### Auth requirement legend

| Marker | Meaning |
| --- | --- |
| public | No session required |
| auth | Any active authenticated user (`withAuth([])`), organization must be active and not suspended |
| roles(...) | Authenticated AND role in list (`Admin`, `Wholesaler`, `Retailer`, `Shipper`) |
| cron | Shared-secret header `x-cron-secret` compared timing-safe against `CRON_SECRET` |

---

## auth

| Endpoint | Auth | Purpose / notes |
| --- | --- | --- |
| POST `/auth/register` | public (5 req/min) | Create user + organization + send verification email. Body: `name, email, phone, password, business_name, location{governorate}, role (retailer\|wholesaler\|shipper), interested_categories?, accepted_terms:true`. Returns 201; non-production only includes `development_verification_token`. |
| GET/POST `/auth/[...nextauth]` | public | NextAuth endpoints: CSRF token, credentials callback login (`/auth/callback/credentials` with `email`,`password`), signout. Sets encrypted HttpOnly session cookie. |
| GET/POST `/auth/verify-email?token=` | public (10 req/min) | One-shot email verification; token accepted via query param or JSON body `{token}`. |
| POST `/auth/resend-verification` | public (3 per 15 min) | Body: `{email}`. Always returns success (no account enumeration). |
| POST `/auth/forgot-password` | public (3 per 15 min) | Body: `{email}`. Sends reset link if account exists; response is identical either way. |
| POST `/auth/reset-password` | public (5 per 15 min) | Body: `{token (min 32 chars), password}`. Bumps `session_version` (invalidates old sessions). |
| GET `/auth/me` | auth | Server-authoritative profile: user, organization, membership role, latest subscription. |

## account

| Endpoint | Auth | Purpose / notes |
| --- | --- | --- |
| GET `/account/export` | auth | JSON export of own data: profile, organization, orders, payment obligations, ratings (last 1000 each). |
| GET `/account/deletion` | auth | Latest data-deletion request status (30-day scheduled deletion). |
| POST `/account/deletion` | auth | Body: `{password, confirmation:"DELETE"}`. Schedules deletion in 30 days; bumps `session_version`. |
| DELETE `/account/deletion` | auth | Body: `{password}`. Cancels a scheduled deletion (404 if none). |

## admin (all require `roles(Admin)`)

| Endpoint | Purpose / notes |
| --- | --- |
| GET `/admin/dashboard` | Platform KPIs: revenue totals (piasters), pending proof/subscription/verification/dispute queue counts, orders by status, organizations by verification status, subscription counters (`active/trialing/lapsed/unpaid_invoices`), active buyer/seller/shipper org counts. |
| GET `/admin/orders` | Paginated all-orders list (Admin). Query: `q` (order number or buyer/seller/shipper org name), `status`, `payment_state` (`paid\|partial\|pending\|not_issued`, computed server-side), `from`, `to`, `min_total_piasters`, `max_total_piasters`, `sort` (`createdAt`\|`total`), `dir`, pagination. Returns populated org refs + `payment_summary`. |
| GET `/admin/orders/[id]` | Full order detail (Admin): order + items + parties + creator, payment obligations (populated payer/beneficiary/reviewer), disputes (populated opener/resolver), tracking events. |
| GET `/admin/organizations` | Admin organization directory incl. unsubmitted/unverified. Query: `q`, `type`, `verification_status`, `is_active`, `include_stats=1` (per-org orders count, spend/sales piasters over non-canceled orders, open disputes, last order date), pagination. |
| GET `/admin/subscriptions` | All subscriptions (Admin) with organization + plan populated. Query: `status`, `q` (org name), pagination. |
| GET `/admin/invoices` | All subscription invoices (Admin) with organization + plan populated. Query: `status`, `q` (invoice number or org name), pagination. |
| GET `/admin/transactions` | Unified financial ledger merging order obligations (platform fee/goods/shipping) and subscription invoices into typed rows, plus an `overview` block of server-computed aggregates (gross processed, pending review, platform revenue split, refunds/refund-pending totals). Query: `tx_type`, `status`, `from`, `to`, `q`, pagination. |
| GET `/admin/analytics` | Daily time-series for a date range (max 180 days): orders created, GMV, confirmed platform fees by confirmation date, paid subscription revenue by review date, new organizations/users, plus range distributions for order statuses and obligation statuses. Query: `from`, `to` (`YYYY-MM-DD`). |
| GET `/admin/audit-logs` | Read-only audit trail (Admin). Query: `action`, `entity_type`, pagination. Actor user populated. |
| GET `/admin/admins` | Directory of admin accounts (safe fields only). |
| PATCH `/admin/admins/[id]` | Activate/deactivate an admin account `{is_active}`. Self-deactivation is rejected (409). Writes an audit log entry. |
| PATCH `/admin/refunds/[obligationId]` | Operator confirmation that a locally-executed refund completed: `{decision:"mark_refunded"}`. Only valid from `refund_pending` (set by dispute resolution); conditional update makes it idempotent. Audit-logged. |
| GET/PATCH `/admin/platform-settings` | Read/update global settings: `order_fee_piasters`, `trial_days`, `subscription_grace_days`, `payment_deadline_hours`, `platform_payment_accounts[]` (max 10), support contacts. PATCH is partial. |
| GET/POST `/admin/subscription-plans` | List/create plans: `code, name_ar, name_en, price_piasters, billing_interval (monthly\|yearly), organization_types[], features[], is_active, sort_order`. |
| POST `/admin/subscriptions/invoices/[id]/review` | Approve/reject submitted invoice proof: `{decision:"approve"} \| {decision:"reject", rejection_reason}`. Approve activates the subscription period. Audit-logged. |
| POST `/admin/organizations/[id]/verification` | Verify/reject/suspend an organization: `{decision:"approve"} \| {decision:"reject"\|"suspend", rejection_reason}`. Rejecting/suspends all documents. Audit-logged. |
| POST `/admin/disputes/[id]/review` | The only exit from order state `disputed`: `{decision:"in_review"} \| {decision:"resolved"\|"rejected", outcome:"complete"\|"cancel", resolution}`. Applies inventory/payment side effects via order service. Audit-logged. |

## cart (require `roles(Retailer)`; cart is per buyer organization)

| Endpoint | Purpose / notes |
| --- | --- |
| GET `/cart` | Current cart with per-item unit/subtotal in piasters and EGP currency marker. |
| POST `/cart` | Add item `{product_id, quantity}`; validates MOQ and available stock (409 when insufficient). |
| PATCH `/cart` | Alias of POST (same schema). |
| DELETE `/cart` | Remove item; body `{product_id}`. |

## orders (checkout-adjacent)

| Endpoint | Auth | Purpose / notes |
| --- | --- | --- |
| POST `/orders` | roles(Retailer) | Create wholesale order. Body: `items[{product_id, quantity}]` (single seller per order), `fulfillment_method ("buyer_pickup"|"third_party_shipping")`, `shipping_rate_id?`, `shipping_address?{governorate,address,contact_name,phone}` (required for shipping). Requires active buyer subscription (HTTP 402 otherwise); prices resolved server-side via tier pricing; clears ordered cart lines. |
| GET `/orders` | auth | Paginated order list scoped to own organizations (Admin sees all). Query: `status`, `page`, `limit`. |
| GET `/orders/[id]` | auth | Order detail + payment obligations; restricted to buyer/seller/shipper org or Admin. |
| PATCH `/orders/[id]/status` | auth | State-machine action. Body: `{action, note?}` where action ∈ `accept, reject, mark_ready, confirm_pickup, confirm_delivery, confirm_receipt, cancel, open_dispute, resolve_dispute_complete, resolve_dispute_cancel`. Guarded by participant/status rules (`backend/lib/orders/order_rules.ts`); 409 on illegal transitions. |
| POST `/orders/[id]/disputes` | auth (order party) | Open dispute: `{reason (10..3000 chars), evidence_urls[] (max 10)}`. |
| GET `/orders/[id]/payments` | auth (order party/Admin) | Payment obligations for the order. |
| POST `/orders/[id]/payments/[paymentId]/proof` | auth (buyer org) | Submit proof: `{method, sender_reference, proof_url, ...}` (`SubmitPaymentProofSchema`). Only while status is `awaiting_payments`; 410 after deadline. |
| POST `/orders/[id]/payments/[paymentId]/review` | auth (beneficiary: platform→Admin, goods→beneficiary org) | Confirm/reject a proof: `{decision:"confirm"} \| {decision:"reject", rejection_reason}`; re-syncs order payment state. |

## conversations

| Endpoint | Auth | Purpose / notes |
| --- | --- | --- |
| GET `/conversations` | auth | Own conversations with unread counts (max 100, newest first). |
| POST `/conversations` | auth | Start conversation tied to exactly one of `order_id` XOR `product_id`, optional `initial_message`. |
| GET `/conversations/[id]/messages` | auth (participant/Admin) | Message history; cursor via `?before=<ISO date>`; marks messages read for own org. |
| POST `/conversations/[id]/messages` | auth (participant) | Send message `{body (max 3000)}`. |

## dashboard

| Endpoint | Auth | Purpose / notes |
| --- | --- | --- |
| GET `/dashboard/wholesaler` | roles(Wholesaler) | Seller KPIs: product/order counts, gross sales, units sold, confirmed goods revenue. |

## disputes

| Endpoint | Auth | Purpose / notes |
| --- | --- | --- |
| GET `/disputes` | auth | Disputes for own orders (Admin: all), max 200, with order number and opener. Resolution happens via `/admin/disputes/[id]/review`. |

## feed / follows / ratings / recommendations / posts

| Endpoint | Auth | Purpose / notes |
| --- | --- | --- |
| GET `/feed` | public | Social feed of wholesaler posts/videos. Query: `category`, `governorate`, `page`, `limit`. Only verified, active wholesalers. |
| GET `/follows` | roles(Retailer) | Organizations followed by own org (paginated). |
| POST `/follows` | roles(Retailer) | Follow: `{wholesaler_organization_id}` (must be verified wholesaler). Idempotent upsert. |
| DELETE `/follows` | roles(Retailer) | Unfollow: query param `wholesaler_organization_id`. |
| GET `/ratings` | public | Reviews + average rating. Query: `target_id`, `target_type` (`organization`\|`product`, default product), pagination. |
| POST `/ratings` | auth | Create rating: `{target_type ("wholesaler"\|"product"), target_id, rating (1..5), review?}`. |
| GET `/recommendations` | roles(Retailer) | Interest-based product recommendations derived from categories, cart, recent orders, follows. |
| GET `/posts` | public | Paginated posts. Query: `category`, `search`, `organization_id` (or legacy `wholesaler_id`), pagination. |
| POST `/posts` | roles(Wholesaler, Admin) | Create post: `caption, category, media_type ("image"\|"video"), media_urls[] (max 8), video_url(s)?, product_id?`. |
| POST `/posts/[id]/likes` | auth | Toggle like for current user (atomic counter via unique index). |
| GET `/posts/[id]/comments` | public | Comments for a post (paginated, limit ≤ 50). |
| POST `/posts/[id]/comments` | auth | Add comment (`CreateCommentSchema`). |

## health

| Endpoint | Auth | Purpose / notes |
| --- | --- | --- |
| GET `/health/live` | public | Liveness: static OK payload. Used by the container healthcheck chain indirectly (compose checks readiness). |
| GET `/health/ready` | public | Readiness: runs `assertProductionConfig()` (fails fast on weak/missing secrets) + MongoDB ping. Returns 503 `{status:"not_ready"}` on failure. Used by the `api` container healthcheck. |

## internal / maintenance

| Endpoint | Auth | Purpose / notes |
| --- | --- | --- |
| POST `/internal/maintenance` | cron | Hourly housekeeping: expire subscriptions, process due deletion requests, cancel unpaid expired orders. Requires header `x-cron-secret: $CRON_SECRET` (secret must be ≥32 chars). Mongo lock makes overlapping cron runs a no-op (`skipped:true`). |

## notifications

| Endpoint | Auth | Purpose / notes |
| --- | --- | --- |
| GET `/notifications` | auth | Paginated notifications + `unreadCount` (limit ≤ 50). |
| PATCH `/notifications` | auth | Mark all as read. |
| PATCH `/notifications/read-all` | auth | Mark all as read (explicit alias route). |
| PATCH `/notifications/[id]/read` | auth | Mark one owned notification read. |

## organizations

| Endpoint | Auth | Purpose / notes |
| --- | --- | --- |
| GET `/organizations` | public | Directory of verified, active organizations. Query: `type (wholesaler\|buyer\|shipper)`, `governorate`, `q` (text search), pagination (limit ≤ 50). Sensitive fields stripped. |
| GET `/organizations/[id]` | public | Public profile of a verified org + product count + rating average. |
| GET `/organizations/me` | auth | Own organization document (null if none). |
| PATCH `/organizations/me` | auth | Update own org profile fields (`display_name, legal_name, description, phone, email, location, tax_number, commercial_register_number, avatar_url, cover_url`). |
| POST `/organizations/me/verification` | auth (owner/manager member role) | Submit verification documents: `{documents:[{type, file_url}]}` (1–10; types incl. commercial_register, tax_card, national_id, shipping_license). Sets status to `pending`. |
| GET/PUT `/organizations/me/payment-accounts` | auth / owner-manager | Local payout accounts list / full replacement `{accounts:[...]}` (max 10). |
| GET `/organizations/me/products` | roles(Wholesaler) | Own products including drafts. |

## platform

| Endpoint | Auth | Purpose / notes |
| --- | --- | --- |
| GET `/platform/payment-accounts` | auth | Active platform payment accounts + current `order_fee_piasters` (EGP). Backs the manual local-payment flow (InstaPay/wallet/bank transfer). |

## products

| Endpoint | Auth | Purpose / notes |
| --- | --- | --- |
| GET `/products` | public (session-aware) | Catalog search over verified wholesalers' active products. Query: `category, tags, governorate, q, min_price, max_price, min_stock, sale_type, sort, organization_id\|wholesaler_id, page, limit`. |
| POST `/products` | roles(Wholesaler) | Create product (`CreateProductSchema`: title, description, price_piasters, price_tiers, moq, images[≥1], stock_quantity, category, publish flag...). Publishing requires verified org; draft otherwise. Requires active subscription (402). |
| GET `/products/[id]` | public | Single active product with seller org summary. |
| PATCH `/products/[id]` | roles(Wholesaler, Admin) | Update own product (Admin any). Publish transitions enforce verification + stock. |
| DELETE `/products/[id]` | roles(Wholesaler, Admin) | Archive/delete own product. |

## profile

| Endpoint | Auth | Purpose / notes |
| --- | --- | --- |
| GET `/profile` | auth | Aggregated profile: user + organization + subscription state + accepted payment methods. |
| PUT `/profile` | auth | Partial update: `name, phone, avatar_url, cover_url, business_name, business_description, location{governorate,address?}, contact_methods{phone,whatsapp,email}`. |

## shippers

| Endpoint | Auth | Purpose / notes |
| --- | --- | --- |
| GET `/shippers` | public | Shipping candidates for a lane. Query: `from`, `to` (governorates); only subscription-entitled, verified shippers. |
| GET `/shippers/rates` | public | Active rates. Query: `shipper_organization_id?`, `from?`, `to?`; entitled shippers only. |
| POST `/shippers/rates` | roles(Shipper, Admin) | Upsert rate: `{from_governorate, to_governorate, price_piasters, estimated_days (1..60), is_active}`. |

## subscriptions

| Endpoint | Auth | Purpose / notes |
| --- | --- | --- |
| GET `/subscriptions` | public | Active plans; optional `organization_type` filter. |
| POST `/subscriptions` | auth | Subscribe own organization: `{plan_id}`; plan type must match org type. Creates pending invoice awaiting manual payment proof. |
| GET `/subscriptions/current` | auth | Latest subscription (with plan) + last 20 invoices for own org. |
| POST `/subscriptions/invoices/[id]/proof` | auth | Submit invoice payment proof: `{payment_method (instapay\|mobile_wallet\|bank_transfer\|cash), sender_reference, proof_url}`. Moves subscription to `under_review`; admin approves via `/admin/subscriptions/invoices/[id]/review`. |

## upload

| Endpoint | Auth | Purpose / notes |
| --- | --- | --- |
| POST `/upload` | auth (15 req/min) | Upload media to Cloudinary. Body: base64 data-URL envelope `{fileData, fileType ("image"\|"video"), mimeType}`. Limits: images 10MB, videos 50MB; MIME allow-list plus magic-byte sniffing (declared type is never trusted alone). Caddy caps request bodies at 70MB. |

## users

| Endpoint | Auth | Purpose / notes |
| --- | --- | --- |
| GET `/users` | roles(Admin) | Paginated user directory. Query: `role`, `active`, pagination. |
| GET/PUT `/users/[id]` | self or Admin | Get/update a profile (`UpdateUserProfileSchema`). Others are rejected with 403. |
| GET/PUT `/users/[id]/payment-settings` | self or Admin | Organization-level receiving accounts (`accounts[]` max 10, methods instapay/mobile_wallet/bank_transfer/cash). |

## wholesalers

| Endpoint | Auth | Purpose / notes |
| --- | --- | --- |
| GET `/wholesalers` | public | Verified wholesaler directory. Query: `governorate`, pagination (≤50); includes product counts/rating stats. |
| GET `/wholesalers/[id]` | public (owner sees unverified self) | Wholesaler storefront profile + stats. |
| GET `/wholesalers/[id]/products` | public (owner sees own) | Products for a publicly visible wholesaler; empty list when not visible. |
| GET `/wholesalers/[id]/posts` | public (owner sees own) | Posts for a publicly visible wholesaler. |
| GET `/wholesalers/[id]/reviews` | public | Reviews + average rating for a wholesaler (limit ≤ 200). |
