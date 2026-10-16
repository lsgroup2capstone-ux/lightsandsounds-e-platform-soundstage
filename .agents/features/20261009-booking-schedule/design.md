# Design: Shared booking and schedule module (with PayMongo payments)

- Feature: `.agents/features/20261009-booking-schedule/spec.md`
- Spec revision: 4
- Also covers: `.agents/features/20261009-paymongo-payments/spec.md` (revision 3), planned together at the user's request (2026-10-13)
- Risk lane: high-risk

## Context and constraints

- Every request runs inside one `sql.begin` transaction that takes the global `pg_advisory_xact_lock(74832019)`, loads all `soundstage.records` into a `MemoryStorage`, runs one action, and writes changed keys back (`lib/server/data-service.ts:372-426`). Actions do not receive the transaction today.
- Browser screens read bookings from the synced `soundstage-client-bookings-v3:<email>` records returned by `visibleRecords()` (`lib/server/data-service.ts:342-368`, `lib/client-bookings.ts:19-33`).
- A booking's provider is identified by `packageId` → the provider's service list `soundstage-provider-services-v2:<email>` (`data-service.ts:56-61`). Its client is identified by the record key email. Provider approval lives in `soundstage-accounts-v2` (`application.status`).
- `auth:profiles --execute` has not run yet (tasks.md), so not every user has a `profiles` row.
- Migrations are a single idempotent `database/schema.sql` that never drops tables. `tests/postgres-schema.cjs` runs it twice in PGlite and asserts the `schema_versions` count (currently 4).
- PGlite ships `btree_gist` (`node_modules/@electric-sql/pglite/dist/contrib/btree_gist.*`). Supabase supports it as an extension.

## User decisions made during planning (2026-10-13)

These refine the specs without contradicting them. Record them in the next spec revision through `/sdd-specify`.

- **U1, ordering:** booking-schedule and paymongo-payments are planned as one sequence. Nothing is deployed to users until the whole sequence is shipped, so no screen is ever left without a way to pay.
- **U2, legacy status mapping (booking AC4/AC5):**

| Legacy JSON | New status | Notes |
| --- | --- | --- |
| `Pending` (paid or unpaid) | `pending` | A legacy verified payment is migrated as a `paid` payment. When the provider accepts, the payments-module check (payments AC15) confirms the booking immediately if paid ≥ 30%. |
| `Confirmed` + `paid` | `confirmed` | |
| `Confirmed` + not paid | not inserted | Reported as unmappable (AC5) so no real event is silently cancelled. |
| `Completed` | `completed` | |
| `Cancelled`, no refund | `cancelled` | |
| `Cancelled` + refund `Pending` | `refund_pending` | |
| `Cancelled` + refund `Paid` | `refunded` | |
| `Cancelled` + refund `Rejected` | `cancelled` | |

## Ownership and data flow

- **Booking module** (`lib/server/bookings/`): sole owner of `bookings`, `booking_status_history`, `availability_schedules`, `reschedule_requests` and `cancellation_requests`. All writes go through `transition()` (status + history in the caller's transaction) or the request/availability functions. No other module writes these tables.
- **Payments module** (`lib/server/payments/`): sole owner of `payments` and `payment_events`. It calls the booking module's `confirmFromPayment(tx, bookingId)`. This is the only caller allowed to use the `awaiting_payment → confirmed` system transition.
- **Identity columns:** bookings store `client_email` and `provider_email` (lowercase), matching how every existing record is keyed. They have no foreign key to `profiles`, because profiles are not complete yet. Moving to profile ids is a follow-up once `auth:profiles` has run.
- **Transaction access:** `execute()` stores `tx` in the AsyncLocalStorage `context` (`lib/server/runtime.ts:4`), next to `storage`. The booking and payments modules read it through `currentTx()`. The global advisory lock stays. Each transition still uses `SELECT … FOR UPDATE` and a status precondition in the `UPDATE`, so correctness does not depend on the global lock (AC14).
- **Compatibility projection (AC26/AC27):** `visibleRecords()` stops reading booking JSON. It builds the same `soundstage-client-bookings-v3:<email>` keys from table rows scoped to the actor: client → own, provider → own provider email, admin → all. Existing screens keep reading the same shape. `Booking.status` carries the new lowercase values, `BookingStatus` is widened to the ten D4 values, and `statusStyles` gets an entry for each.
- **Payment hold expiry (D5/AC20):** this is lazy. `expireHolds(tx)` runs at the start of every booking create, accept, reschedule approval and payment confirmation. It cancels `awaiting_payment` rows whose `hold_expires_at < now()`, with history reason "payment expired". No cron is needed.

## Contracts

- `bookings`: `id uuid pk`, `idempotency_key text unique`, `client_email`, `provider_email`, `package_id`, snapshot `package_name`, `package_inclusions jsonb`, `package_price numeric(12,2)`, plus legacy pricing fields (`base_price`, `transportation_fee`, `total`). Also `start_date date`, `end_date date` (exclusive), `event_time`, `event_type`, `location`, `event_town`, `guests`, `notes`, `image`, `status`, `hold_expires_at`, `cancelled_by`, `legacy_id text unique`, `created_at` and `updated_at`.
  - `CHECK (status IN (…10…))` and `CHECK (end_date > start_date)`.
  - `EXCLUDE USING gist (provider_email WITH =, daterange(start_date,end_date) WITH &&) WHERE (status IN ('confirmed','in_progress'))`.
  - A trigger rejects updates to snapshot columns (AC8).
- `booking_status_history`: `id bigserial`, `booking_id`, `old_status` (null for creation), `new_status`, `actor_id`, `actor_role` (`client|provider|admin|payroll_master|system`), `reason`, `created_at`. A trigger raises on `UPDATE` or `DELETE` (AC15).
- `availability_schedules`: `provider_email`, `kind` (`weekly|blocked`), `weekday smallint` (0–6, weekly only) or `blocked_date date`, unique per provider and kind/value.
  - **Decision:** "weekly working days" means the days listed are working days. A provider with no weekly rows is treated as working every day, which keeps current providers bookable.
- `reschedule_requests` / `cancellation_requests`: `id`, `booking_id`, `status pending|approved|declined`, `requested_by`, `decided_by`, `decided_at`, `reason`; reschedule also has `new_start_date` and `new_end_date`. A partial unique index on `(booking_id) WHERE status='pending'` enforces at most one pending request (D9/AC21). Decision columns can only be set once, enforced by the `WHERE status='pending'` clause in the update (AC24).
- `payments` / `payment_events`: as payments spec D3. `payments.target_kind booking|subscription`, `target_id text`, `type downpayment|full|balance|subscription`, `amount numeric(12,2)`, `legacy_id text unique`, `checkout_session_id text unique`. Partial unique index on `(target_id, type) WHERE status='pending'` (payments D12).
- Booking module API (server-only, all take the ambient `tx`):
  - `createBooking(actor, input, idempotencyKey)`
  - `transition(id, to, actor, reason?)`
  - `isBookable(providerEmail, start, end, excludeId?)`
  - `expireHolds()`
  - `confirmFromPayment(bookingId)`
  - `requestReschedule` / `decideReschedule` / `requestCancellation` / `decideCancellation`
  - `setWeeklyDays` / `toggleBlockedDate`
  - `listVisible(actor)`
- Browser actions: the `actions` allowlist keeps every existing name (AC26).
  - `saveClientBooking` returns `{ id }` with no checkout.
  - New actions: `acceptBooking`, `declineBooking`, `startBookingPayment(bookingId, type, method)`, `requestReschedule`, `decideReschedule`, `requestCancellation`, `decideCancellation` and `setWeeklyAvailability`.
- Webhook: `POST /api/webhooks/paymongo`. The old `POST /api/paymongo/webhook` re-exports the same handler.

## Failure, security, and rollback

- Trust boundaries:

| Boundary | Control | Owner | Evidence |
| --- | --- | --- | --- |
| Browser → `/api/data` actions | Role and ownership checks inside each booking function. A non-owner gets `404 Booking not found` (AC13). | booking module | `tests/bookings.cjs` denial cases |
| Client input → booking | Server computes dates, price and snapshot; client-supplied prices are ignored. | booking module | tests |
| PayMongo → webhook | Signature on the raw body, then event-id insert in the same transaction, exact amount match, and confirmation only via `confirmFromPayment` (AC16–AC19). | payments module | `tests/paymongo-webhook.cjs` forged/duplicate/mismatch |
| Database | Exclusion constraint, CHECKs, append-only trigger, snapshot trigger, and revoked `anon`/`authenticated` access. | schema | `tests/postgres-schema.cjs` |

- Denied, invalid, replayed and out-of-order cases:
  - A wrong transition raises `Cannot <to> a booking that is <status>` (AC11).
  - A duplicate idempotency key returns the first booking (AC10).
  - A duplicate webhook event returns 200 with no change.
  - A late payment sets the payment to `review` and records a reason (AC17).
  - An exclusion-constraint violation (`23P01`) maps to the error "These dates are already booked".
- Rollback and forward recovery:
  - The schema is additive, and JSON booking and payment records are never modified by the migration.
  - Reverting the code restores the JSON path. Bookings created after cutover then exist only in tables, so the migration script has an `--export` that writes table bookings back as JSON for an emergency revert.
  - Deployment happens only after all plans ship and the user authorizes it (U1).

## Non-functional evidence

- Performance: indexes on `provider_email`, `client_email`, `status`, and the gist range index. `EXPLAIN` of the `isBookable` query should show index use (manual, recorded in the plan 1 report).
- Accessibility: not applicable here, except the minimal pay/accept controls in plan 4, which use existing `Button` components and a `role="status"` message.
- Observability: history rows; `recordMarketplaceAction` on each change (existing behavior); migration prints migrated, skipped, conflicting and unmappable counts; webhook logs `review`/failure without payloads.

## Alternatives rejected

- Keeping JSON as the read source and dual-writing: rejected by spec D1, because the two sources would drift.
- A cron for hold expiry: there is no scheduler in the stack. Lazy expiry before every evaluation satisfies AC20.
- Profile-id foreign keys: profiles are not complete until `auth:profiles` runs (see Ownership).
- A separate migration script per feature: legacy paid `Pending` bookings need their payment migrated in the same run (U2), so one script handles both.
