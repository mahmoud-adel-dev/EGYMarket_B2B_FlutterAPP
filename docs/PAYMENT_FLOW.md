# Payment Flow

SEALS is a **proof-of-payment marketplace**: the platform never holds merchant funds.
Buyers transfer money directly to each beneficiary through local Egyptian rails and
upload proof; the beneficiary (or an admin) confirms after checking their own account.

## Obligations

Accepting an order creates one `PaymentObligation` per beneficiary — amounts are always
server-computed from product quantity tiers, shipping rates, and platform settings
(never client input):

| Kind | Payer | Beneficiary | Amount source |
|---|---|---|---|
| `platform_fee` | buyer org | platform | `settings.order_fee_piasters` |
| `goods` | buyer org | seller org | Σ item subtotals (quantity-tier priced) |
| `shipping` | buyer org | shipper org | selected `ShippingRate.price_piasters` |

Each obligation snapshots the beneficiary's active payment accounts at creation time, so
later account edits cannot misdirect a payment already instructed to the buyer.

Uniqueness: `{order_id, kind}` unique index — obligations exist at most once per order.

## Lifecycle of an obligation

```
pending → proof_submitted → confirmed
   ↓            ↓               ↓
rejected      disputed ────► refund_pending ──► refunded (manual, outside system)
```

1. **Submit** (`POST /api/orders/[id]/payments/[paymentId]/proof`) — buyer only, while
   the order is still `awaiting_payments` and before the deadline. Atomic claim: only a
   `pending`/`rejected` obligation can flip. Method must match a snapshot account.
2. **Review** (`POST .../review`) — beneficiary confirms or rejects with reason.
3. **Auto-advance** — when every obligation is `confirmed`,
   `syncOrderPaymentState` moves the order `awaiting_payments → preparing`
   (conditional transition; idempotent under concurrency).

Admins confirm `platform_fee` proofs from the admin dashboard (same state sync applies).

## Subscription invoices

Plan purchases follow the same pattern: organization uploads proof for a
`SubscriptionInvoice`; admin review either activates/extends the subscription or rejects.
Submission requires the invoice in `pending`/`rejected` and flips the subscription to
`under_review` atomically.

## Deadline & cancellation

`payment_due_at` is set at accept time from `settings.payment_deadline_hours`.
The hourly cron cancels expired unpaid orders and releases reserved stock. Buyers may
cancel freely before submitting any proof; after that, disputes handle refunds.

## Auditability

Every dispute action, admin confirmation, verification decision, settings change, and
plan creation writes an `AuditLog` record (actor, organization, action, entity,
metadata). Proof URLs and references are stored on the obligation itself. Logs never
contain passwords, cookies, or secrets.
