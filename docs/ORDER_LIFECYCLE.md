# Order Lifecycle

## Status machine

```
requested ──accept(seller)──► awaiting_payments ──all obligations confirmed──► preparing
    │                              │                                              │
    ├─reject(seller)─► rejected    ├─cancel(buyer)─► canceled                     ├─mark_ready(seller)─► ready_for_pickup
    │                              │                                              │        │
    │                              ├─deadline expired (System)─► canceled          │        │ (third_party_shipping)
    │                              │                                              │        ▼
    │                              ▼                                              │   confirm_pickup(shipper)─► in_transit
    │                          open_dispute(any party)────────────┐               │        │
    │                                                             ▼               ▼   confirm_delivery(shipper)
    └──────────────────────────────────────────────────► disputed ◄──────────── delivered (buyer_pickup path:
                                                                       ▲           confirm_receipt(buyer))
                                                                       │                │
                                              resolve_dispute_cancel(admin)             │ (third_party_shipping)
                                                                       │                ▼
                                                                  canceled      confirm_receipt(buyer)─► completed
```

`disputed` is **not** a terminal state: platform admins exit it via
`resolve_dispute_complete` (order completes; frozen obligations restore to `confirmed`;
inventory commits) or `resolve_dispute_cancel` (order cancels; reserved stock releases;
submitted/confirmed/disputed obligations become `refund_pending`).

## Rules engine

All transitions are authorized by the pure decision table in
`backend/lib/orders/order_rules.ts` (`isOrderActionAllowed`). The API and unit tests share
it; no route may write `order.status` outside `lib/orders/order_service.ts`.

| Action | Actor | Allowed from |
|---|---|---|
| accept / reject | seller (admin override) | requested |
| mark_ready | seller | preparing |
| confirm_pickup | shipper | ready_for_pickup (third_party_shipping only) |
| confirm_delivery | shipper | in_transit |
| confirm_receipt | buyer | ready_for_pickup (pickup), delivered (shipping) |
| cancel | buyer only | requested, awaiting_payments (no submitted payments) |
| open_dispute | any party | awaiting_payments … completed (never `requested`) |
| resolve_dispute_complete/cancel | admin only | disputed |

## Concurrency & atomicity (critical)

Every mutation is a **single-statement conditional update** (`findOneAndUpdate` with a
status precondition). This is the race gate: exactly one concurrent caller wins each
transition, so one-shot effects execute exactly once.

Inventory is protected by two boolean claims on the order:

- `inventory_reserved` flip true→false gates stock release (`releaseReservedStockOnce`)
- `inventory_committed` flip false→true gates stock decrement (`commitInventoryOnce`)

Accept flow (`acceptOrder`) additionally runs inside a MongoDB transaction when the
deployment supports it (Atlas = replica set); standalone dev falls back to the same
sequence with compensation (reservation rollback if obligation creation fails or the
transition is lost). Payment obligations carry a unique `{order_id, kind}` index making
creation idempotent; a retried accept after a crash auto-heals missing obligations.

Failure examples handled:

- Double-tap on "confirm receipt": second caller loses the status gate → 409, stock decremented once.
- Accept + reject concurrently: transition gate decides; loser's reservation is compensated.
- Dispute opened while another actor completes the order: dispute document creation is compensated (deleted).

## Side effects per transition

| Transition | Inventory | Payments | Notifications |
|---|---|---|---|
| accept | reserve (+reserved_quantity) | create obligations + payment_due_at | buyer notified |
| cancel (buyer) | release reservation | delete pending/rejected obligations | seller notified |
| deadline expired (cron) | release reservation | delete pending/rejected | buyer notified |
| all confirmed | – | – | preparing transition recorded by system note |
| confirm_receipt | commit (stock −qty) | – | counterpart notified |
| open_dispute | release if still reserved | submitted/confirmed → disputed | audit log entry |
| resolve complete | commit | disputed/proof_submitted → confirmed | audit log entry |
| resolve cancel | release | * → refund_pending | audit log entry |

## Maintenance

`POST /api/internal/maintenance` (hourly cron, `x-cron-secret` header) cancels unpaid
expired orders, expires subscriptions past grace, and processes due deletion requests.
An overlap lock (`maintenance_locks` collection) prevents concurrent double-cancellation.
