---
artifact: plan
schema: 1
feature: 20261009-booking-schedule
revision: 1
status: plan-approved
risk: high-risk
---

# Plan 2: Booking core domain

- Feature: `.agents/features/20261009-booking-schedule/spec.md`
- Design: `.agents/features/20261009-booking-schedule/design.md`
- Implements decisions: D1 (server side), D5, D6, D7, D10 (check), D11, D12, D13, Allowed transitions table
- Spec revision: 4
- Depends on: plan 1
- Status: plan-approved
- Estimate: about 380 lines of diff; split point: after Phase 2 (`transition` + `createBooking`). Phase 3 (`confirmFromPayment`, `expireHolds`) can be a follow-up part.

## Goal

A server-only booking module creates bookings with snapshots and applies every allowed transition with a history row in the request's transaction. It enforces ownership, idempotency, availability and lazy hold expiry. It is not yet wired to the browser actions (plan 4).

## Evidence (checked in the repository)

- `lib/server/runtime.ts:4`: AsyncLocalStorage `context` holds `storage`/`session`/`pendingDeletes`. Add `tx` here.
- `lib/server/data-service.ts:372-380`: `execute()` opens `sql.begin` and the global lock, then `context.run(state, …)`. Pass `tx` into `state`.
- `lib/server/data-service.ts:258-281`: current create logic: active service lookup, date validation, blocked dates, overlap, price `service.price * (1 + .38*(duration-1))` plus transport fee, downpayment 30%. Reuse the pricing helpers from `lib/booking-pricing`.
- `lib/server/data-service.ts:282-295`: current status rules to be replaced.
- `lib/server/domain/provider-services.ts:5`: `ProviderService` shape; there is no `inclusions` field, so the snapshot stores `[]` when absent (`lib/mock-data.ts:30` shows `inclusions: string[]` on mock packages).
- `lib/server/data-service.ts:56-61`: provider ownership via the service key email.
- `lib/server/request-error.ts`: `RequestError(message, status)`.
- `tests/postgres-schema.cjs:28-36`: pattern for running TS server modules against PGlite through `ts-loader.cjs`.

## Phases

### Phase 1: Plumbing

- `runtime.ts`: add an optional `tx` to the context type, plus `currentTx()`, which throws if it is missing.
- `data-service.ts` `execute()`: put `tx` into `state`. No other behavior change.

### Phase 2: Create and transition (`lib/server/bookings/core.ts`, `lib/server/bookings/rules.ts`)

- `rules.ts`: the transition table as data `{from, to, actor, check}`; `BOOKING_STATUSES`.
- `isBookable(providerEmail, start, endExclusive, excludeId?)`:
  - false for a past start date (Asia/Manila date);
  - false for a blocked date or a non-working weekday (no weekly rows means every day works);
  - false for an overlap with `confirmed`/`in_progress`, or with `awaiting_payment` whose hold has not expired.
  - It returns a reason code.
- `createBooking(actor, input, idempotencyKey)`:
  - Requires the client role and a non-empty idempotency key.
  - If the key exists for the same client, return that row (AC10).
  - Resolve the active service and its owner email from records. Require provider `application.status === "Approved"`.
  - Run `expireHolds()`, then `isBookable`.
  - Insert `pending` with the snapshot and history (`old_status` null), all through `currentTx()`.
- `transition(id, to, actor, reason?)`:
  - `SELECT … FOR UPDATE`. For a non-owner (client email or provider email mismatch) or a missing row, throw `404 Booking not found` (AC13).
  - Look up the rule, or throw `Cannot <to> a booking that is <status>` (AC11).
  - Check the conditions: reason required for decline and provider cancel; start date ≤ today for `in_progress`/`completed`; `isBookable` on accept.
  - `UPDATE … WHERE id=$1 AND status=$from`. Zero rows means a lost race and the same error (AC14).
  - Insert history. Any error rolls back the whole request transaction (AC12).
  - Map `23P01` to "These dates are already booked".
- Accept sets `accepted`, then immediately `awaiting_payment` with `hold_expires_at = now() + 48h`. That is two history rows: the second has actor `system`.
- Unpaid client cancel from `pending`/`accepted`/`awaiting_payment` is instant.
- **Paid check:** booking "paid" means the sum of payments with status `paid`. Plan 2 calls an injected `paidTotal(bookingId)` that returns 0 until payments plan 1 provides it, using a small registry in `bookings/core.ts`.

### Phase 3: Payment hooks and expiry

- `expireHolds()`: for each `awaiting_payment` row with an expired hold, run `transition` as `system` with reason "payment expired" (AC20).
- `confirmFromPayment(bookingId)`:
  - Not in the browser actions allowlist.
  - Run `expireHolds()` and lock the row.
  - If the status is `awaiting_payment` and `paidTotal ≥ 0.3 × package_price` and the dates are still bookable, apply `confirmed` (system).
  - Otherwise return `{confirmed:false, reason:"hold_expired"|"dates_taken"|"insufficient"}`. The caller (payments) marks the payment `review` (AC17).
- The `accepted → awaiting_payment` step also calls `confirmFromPayment` when legacy paid money already covers 30% (design U2).

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T2.1 | plan 1 | `runtime.ts`, `data-service.ts` | none | existing `npm test` passes unchanged |
| T2.2 | T2.1 | `bookings/core.ts` | AC7 | `tests/bookings.cjs`: create → one `pending` row, snapshot equals service, one history row |
| T2.3 | T2.2 | `bookings/core.ts` | AC8 (evidence; owned by plan 1) | edit the service in records after creation; the booking snapshot is unchanged |
| T2.4 | T2.2 | `bookings/core.ts` | AC9 | past date, blocked date, non-working day, overlap, inactive package, unapproved provider → each a specific error, zero rows |
| T2.5 | T2.2 | `bookings/core.ts` | AC10 | same key twice → same id, one row |
| T2.6 | T2.2 | `bookings/rules.ts`, `core.ts` | AC11 | table-driven: every (from,to,actor) not in the spec table is rejected with the current status in the message |
| T2.7 | T2.6 | `core.ts` | AC12 | stub a history insert failure → status unchanged |
| T2.8 | T2.6 | `core.ts` | AC13 | another client or provider → 404 with no booking fields in the message |
| T2.9 | T2.6 | `core.ts` | AC14 | two concurrent PGlite transactions accept and cancel → exactly one applies |
| T2.10 | T2.6 | `core.ts` | AC16 | paid stub 30% → `confirmed` with a system history row; 29% → not confirmed |
| T2.11 | T2.10 | `core.ts` | AC17 | another booking confirmed on the same dates first → `{confirmed:false, reason:"dates_taken"}`, status unchanged |
| T2.12 | T2.6 | `core.ts` | AC20 | hold in the past → the next create on those dates first cancels it with reason "payment expired" |

## Tests

- New `tests/bookings.cjs` (added to the `npm test` script), using PGlite with `btree_gist` and `ts-loader.cjs` like `tests/postgres-schema.cjs`.

## Out of scope

- From the spec:
  - UI pages.
  - Refund decision UI.
  - Refund policy.
  - Moving packages or accounts to tables.
  - Dropping JSON records.
- Deferred:
  - Reschedule, cancellation requests and availability writes (plan 3).
  - Browser actions and projection (plan 4).
  - The real `paidTotal` (payments plan 1).
  - Refund transitions (refund module).

## Acceptance

- Spec: AC7, AC9, AC10, AC11, AC12, AC13, AC14, AC16, AC17, AC20. AC8 is covered with plan 1: plan 1 owns the database guard, and this plan's T2.3 is behavior evidence counted under plan 1.
- Technical: file size under 300 lines per file; parameterized SQL only (tagged templates).

## Verification

- Routine local checks: `npm test`, `npm run typecheck`.
- Scoped operations: none.
- Manual: none (not reachable from the UI yet).

## Expert skills to apply

- none

## Risks and stop points

- If PGlite cannot run two concurrent transactions for T2.9, test the conditional `UPDATE … WHERE status=` with zero affected rows instead, and say so in the report.
- If date handling needs a timezone library → stop. Use `Asia/Manila` through `Intl.DateTimeFormat` and do not add a dependency.
