# SEALS Feature Matrix

Derived by cross-referencing: API routes (`backend/app/api/**`) ↔ Mongoose models (`backend/models/*`) ↔
services (`backend/lib/*`) ↔ Flutter repositories/cubits (`app/lib/features/*/data|presentation`) ↔
Flutter routes/screens ↔ Admin pages (`backend/app/admin/**`).

Status legend: **Complete** · **Partial** · **Backend only** · **Frontend only** · **Missing** · **Broken** · **Deprecated**

## 1. Authentication & Accounts

| Feature | API | Model | Flutter | Admin | Status |
|---|---|---|---|---|---|
| Register (+ org provisioning, trial subscription) | `/api/auth/register` | User, Organization, OrganizationMember, Subscription | `register_screen` | – | Complete |
| Login (NextAuth credentials, HttpOnly cookie) | `/api/auth/[...nextauth]` | User | `login_screen` + `auth_cubit` | `admin/login` | Complete |
| Logout / session restore | NextAuth signout, `/api/auth/me` | User (session_version) | `auth_cubit` | signout button | Complete |
| Email verification | `/api/auth/verify-email`, `resend-verification` | VerificationToken | handled via links/`login_screen` resend | – | Complete |
| Forgot / reset password | `/api/auth/forgot-password`, `reset-password` | VerificationToken, User | forgot/reset flows via login screen links | – | Complete |
| Account lockout / suspension enforcement | guard + authOptions | User | blocked-account messaging | users list | Complete |
| Profile view/edit (avatar, cover) | `/api/profile`, `/api/users/[id]` | User | `role_based_profile_screen`, `edit_profile_screen` | – | Complete |
| Payment settings (user-level) | `/api/users/[id]/payment-settings` | User.payment_accounts | `merchant_payment_settings_screen` | – | Complete |
| Data export / deletion (GDPR-style) | `/api/account/export`, `/api/account/deletion` | DataDeletionRequest | `account_data_screen` | – | Complete |

## 2. Organizations & Memberships

| Feature | API | Model | Flutter | Admin | Status |
|---|---|---|---|---|---|
| Organization profile view/update | `/api/organizations/me`, `/api/organizations/[id]` | Organization | account hub → org profile | organizations queue | Complete |
| Member management (roles owner/manager/staff) | membership model + provisioning | OrganizationMember | ⚠️ no member-management UI | – | Partial (backend only) |
| Verification document upload + status | `/api/organizations/me/verification` | Organization.verification_* | `organization_verification_screen` | admin review action | Complete |
| Suspension enforcement | `withAuth` guard | Organization.is_active / verification_status | blocked messaging | org suspend action | Complete |

## 3. Subscriptions & Plans

| Feature | API | Model | Flutter | Admin | Status |
|---|---|---|---|---|---|
| Plan catalog | `/api/subscriptions` GET | SubscriptionPlan | `subscription_plans_screen` | plans CRUD in settings | Complete |
| Current subscription / history | `/api/subscriptions/current`, `/api/subscriptions/invoices` | Subscription, SubscriptionInvoice | same screen | dashboard queues | Complete |
| Subscribe + invoice proof upload | POST `/api/subscriptions`, `/api/subscriptions/invoices/[id]/proof` | SubscriptionInvoice | proof dialog | invoice review action | Complete |
| Entitlement gating (trading requires active/grace sub) | `lib/subscriptions/entitlements.ts` used by trading routes | Subscription | error surfaces | – | Complete |
| Expiry/grace maintenance cron | `/api/internal/maintenance` | Subscription | – | runbook | Complete |

## 4. Products & Inventory

| Feature | API | Model | Flutter | Admin | Status |
|---|---|---|---|---|---|
| Product CRUD (17-field editor, tiers, specs, FAQs, media) | `/api/products`, `/api/products/[id]`, `/api/organizations/me/products` | Product | `seller_products_screen` + editor | – | Complete |
| Quantity pricing tiers / MOQ | server-side pricing `lib/orders/pricing.ts` | Product.quantity_prices | tier display in product sheet | – | Complete |
| Catalog search/filter/sort/pagination | GET `/api/products` | Product indexes | `product_catalog_screen` | – | Complete |
| Public wholesaler store products | `/api/wholesalers/[id]/products` | Product | `wholesaler_profile_screen` | – | Complete |
| Stock reservation / commit / release | order service | Product.stock_quantity/reserved_quantity | order timeline states | – | Complete (hardened this pass) |
| Low-stock visibility | dashboard aggregation | Product | `wholesaler_dashboard_screen`, profit report | – | Complete |

## 5. Cart & Checkout

| Feature | API | Model | Flutter | Status |
|---|---|---|---|---|
| Server cart (retailers) | `/api/cart` | Cart | `cart_screen` + cubit | Complete |
| Guest local cart + sync-on-login | – | SharedPreferences | `local_cart_screen` + service | Complete |
| Checkout: pickup vs shipper, address, pricing server-side | `/api/orders` POST | Order | `checkout_screen` | Complete |
| Shipping rates selection | `/api/shippers`, `/api/shippers/rates` | ShippingRate | checkout shipping step; shipper rate manager | Complete |

## 6. Orders

| Feature | API | Flutter | Status |
|---|---|---|---|
| Create order (server-computed money) | POST `/api/orders` | checkout | Complete |
| List orders per role + pagination | GET `/api/orders` | `orders_list_screen` | Complete |
| Order details + timeline + participants | GET `/api/orders/[id]` | `order_details_screen` | Complete |
| State machine transitions (accept/reject/mark_ready/pickup/delivery/receipt/cancel) | PATCH `/api/orders/[id]/status` + rules engine | role-gated buttons | Complete (hardened) |
| Disputes (open + admin resolution) | `/api/orders/[id]/disputes`, admin review | dispute sheet in order details | Complete (hardened) |
| Maintenance auto-cancel expired unpaid orders | internal maintenance | – | Complete |

## 7. Payments

| Feature | API | Flutter | Status |
|---|---|---|---|
| Obligations: platform fee / goods / shipping | created on accept; GET `/api/orders/[id]/payments` | payment cards in order details | Complete |
| Proof submission (method, reference, receipt image) | POST `.../payments/[paymentId]/proof` | proof dialog | Complete |
| Beneficiary/admin confirmation or rejection | POST `.../payments/[paymentId]/review` | review buttons | Complete |
| Platform collection accounts directory | `/api/platform/payment-accounts` | checkout/payment dialogs | Complete |
| Subscription invoices proof flow | `/api/subscriptions/invoices/[id]/proof` | `subscription_plans_screen` | Complete |
| Auto state sync → preparing when all confirmed | `syncOrderPaymentState` | timeline | Complete |

## 8. Social: Posts, Feed, Follows, Ratings

| Feature | API | Flutter | Status |
|---|---|---|---|
| Posts CRUD + comments + likes | `/api/posts*` | feed + composer + details | Complete |
| Feed discovery (verified-only, governorate filter) | `/api/feed` | `social_feed_screen` | Complete |
| Follow/unfollow wholesalers | `/api/follows` | catalog/profile follow buttons | Complete |
| Ratings & reviews (purchase-gated) | `/api/ratings` | profile reviews tab + rating dialog | Complete |
| Recommendations | `/api/recommendations` | catalog section | Complete |

## 9. Messaging & Notifications

| Feature | API | Flutter | Status |
|---|---|---|---|
| Conversations (order inquiries + chat) | `/api/conversations*` | `conversations_screen` + chat screen (polling) | Complete |
| Unread counts | aggregate per conversation | badges | Complete |
| Notifications center, read/read-all | `/api/notifications*` | `notification_center_screen` + badge polling | Complete |
| Realtime transport | – | polling only | Planned abstraction (documented; not fragile-added) |

## 10. Dashboards & Analytics

| Feature | API | Flutter | Status |
|---|---|---|---|
| Wholesaler metrics | `/api/dashboard/wholesaler` | `wholesaler_dashboard_screen` | Complete |
| Sales/profit report | derived from dashboard data | `profit_report_screen` | Complete |
| Shipper operations | orders API filtered by shipper role | `shipper_dashboard_screen` — was placeholder wrapper → real screen this pass | ✅ Fixed |

## 11. Admin Dashboard (Next.js)

| Feature | Page/Action | Status |
|---|---|---|
| Admin auth (session + DB re-check per page/action) | `require_admin.ts` | Complete |
| Metrics dashboard + pending queues | `admin/page.tsx` | Complete |
| Org verification approve/suspend/reject | actions | Complete (audit added) |
| Subscription invoice review | actions | Complete (audit added) |
| Platform fee proof confirm | actions | Complete |
| Dispute resolve/reject (now drives order exits from disputed) | actions + API | ✅ Fixed |
| Settings: platform fee, payment deadline, collection accounts, plan CRUD | `admin/settings` | Complete (audit added) |
| Users list/suspend | `/api/users`, `/api/users/[id]` PUT | Partial (API complete; admin UI list exists via API only) |
| Audit trail | AuditLog model + writes | Complete for enterprise-critical mutations |

## 12. Cross-Cutting

| Concern | Status |
|---|---|
| Multi-tenant isolation on all protected reads/writes | Verified route-by-route (see ENTERPRISE_AUDIT P1/P2 table) |
| Arabic/English + RTL/LTR | Design-system/directionality contract verified; legacy translation coverage remains tracked debt |
| Responsive mobile/tablet/desktop shell | Desktop sidebar ≥1024px, tablet tuning improved this pass |
| Health/live + health/ready endpoints | Present; Docker healthchecks wired |
| Request correlation IDs + structured logs | Added this pass |
| CI (lint/typecheck/tests/builds) | Upgraded this pass |
| Production Docker deployment incl. Flutter Web | Added this pass |
