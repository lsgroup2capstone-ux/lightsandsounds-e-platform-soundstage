---
artifact: spec
schema: 1
feature: 20261009-booking-schedule
revision: 5
status: spec-approved
risk: high-risk
---

# Shared booking and schedule module

- Feature id: 20261009-booking-schedule
- Revision: 4
- Status: spec-approved
- Risk lane: high-risk
- Approved by: user, 2026-10-09
- Related decisions: .agents/decisions/0001-clerk-auth-profiles-roles.md (proposed), .agents/decisions/0002-bookings-relational-source.md (proposed), .agents/decisions/0004-financial-records-and-audit.md (proposed)
- Depends on: .agents/features/20261009-role-based-access/spec.md
- Used by: .agents/features/20261009-client-module/spec.md, .agents/features/20261009-provider-module/spec.md

## Problem

Bookings are JSON arrays in a key-value table, so the database cannot prevent double-booking, record status history, or enforce valid transitions. The platform needs a shared relational booking module with a defined status flow, schedule rules, request workflows, and payment-gated confirmation that client, provider, and admin features all use.

Facts found in the code:

- Bookings are stored in `soundstage.records` under `soundstage-client-bookings-v3:<email>` (`lib/server/domain/client-bookings.ts:6`); provider, admin, and client screens read them through `client-bookings.ts` functions (`getAllBookings`, `getClientBookings`, `saveClientBooking`, `updateClientBookingStatus`, `submitEventFeedback`, `requestBookingRefund`, `reviewBookingRefund`).
- `Booking`, `BookingStatus`, and `statusStyles` are defined in `lib/mock-data.ts` (status at line 57, refund shape at line 63, styles at line 256).
- Bookings span days (`durationDays`, `startDate` in `components/booking/booking-flow.tsx:51,153`).
- Database access uses the `postgres` library with `sql.begin` transactions and `pg_advisory_xact_lock(74832019)` (`lib/server/data-service.ts:331-333`, `lib/server/signup-sms.ts:57`).
- PayMongo payment confirmation arrives at `app/api/paymongo/webhook/route.ts` (helpers in `lib/server/paymongo.ts`).
- The `soundstage` schema revokes all access from `anon` and `authenticated` (`database/schema.sql:3-6,51-52`); migrations are additive and never drop tables (`database/schema.sql:2`).
- Packages are JSON records under `soundstage-provider-services-v2:<email>` (`lib/server/domain/provider-services.ts:19`).

## Decisions

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | Relation to the JSON store | New tables are the only source of booking data. Existing JSON bookings are migrated. Existing `client-bookings.ts` function names are rewired to the tables so the admin hub keeps working without UI changes. | Overlap, history, and transactions are reliably enforceable only in the database; two sources would drift. |
| D2 | Risk lane | High-risk. | Schema, money, data migration. |
| D3 | Tables | `soundstage.bookings`, `soundstage.booking_status_history`, `soundstage.availability_schedules`, `soundstage.reschedule_requests`, `soundstage.cancellation_requests`. | Required by the user. |
| D4 | Status flow | `pending → accepted → awaiting_payment → confirmed → in_progress → completed`; alternatives `declined`, `cancelled`, `refund_pending`, `refunded`. | Required by the user. |
| D5 | What blocks a provider's dates | `confirmed` and `in_progress` block, enforced by a database exclusion constraint on the date range. `awaiting_payment` holds the dates for 48 hours, then automatically moves to `cancelled` with reason "payment expired". | Prevents two clients paying for the same dates. |
| D6 | Payment that confirms | A verified 30% downpayment or full amount moves `awaiting_payment → confirmed`; the remaining balance stays payable. Only the verified PayMongo confirmation can confirm. | Matches client module D9; user rule "confirmed only after verified payment". |
| D7 | `in_progress` and `completed` | Provider moves both, only on or after the event start date. | The provider knows when the event happens. |
| D8 | Refund flow | Owned by the refund module (20261009-refund-module): a new refund request moves the booking to `refund_pending`; a completed refund moves it to `refunded`; a rejected or withdrawn request returns it to `cancelled`. | Revised in rev 4: refund module. |
| D9 | Request tables | Reschedule and cancellation requests each have status `pending|approved|declined`, a single decision, and at most one pending request per type per booking. An approved reschedule re-checks overlap and availability in the same transaction. | Prevents conflicting decisions and double-booking. |
| D10 | Availability | `availability_schedules` holds weekly working days and blocked dates per provider; booking and reschedule requests on unavailable dates are rejected server-side. | Matches provider module P9. |
| D11 | Status history | Every status change inserts a row with old status, new status, actor id, actor role, reason, and timestamp. Rows are never updated or deleted. | Required; audit trail. |
| D12 | Snapshot | Package name, inclusions, and price are copied into the booking at creation and never change afterwards. | Required by the user. |
| D13 | Validation and transactions | All writes go through server-side domain functions that validate input, check actor and current status, and run the status change plus history insert in one transaction. | Required by the user. |

## Allowed transitions

| From | To | Actor | Condition |
| --- | --- | --- | --- |
| (new) | pending | client | dates available, package published, provider approved |
| pending | accepted | provider (owner) | dates still available |
| pending | declined | provider (owner) | reason required |
| pending, accepted, awaiting_payment | cancelled | client (owner) | unpaid; instant |
| accepted | awaiting_payment | system | immediately after accept, starts 48h hold |
| awaiting_payment | confirmed | system | verified PayMongo payment ≥ 30% |
| awaiting_payment | cancelled | system | 48h hold expired, reason "payment expired" |
| confirmed | in_progress | provider (owner) | on or after event start date |
| in_progress | completed | provider (owner) | on or after event start date |
| confirmed | cancelled | provider (owner) | reason required; refund-eligible |
| confirmed | cancelled | system | client cancellation request approved by provider |
| cancelled (paid) | refund_pending | client (owner) | provider-cancelled or approved cancellation request; one request |
| refund_pending | refunded | system (refund module) | refund completed with provider reference |
| refund_pending | cancelled | system (refund module) | refund rejected by payroll master or withdrawn by client |

Any transition not in this table is rejected.

## Out of scope

- UI pages: client and provider modules own them.
- Refund decision UI: owned by the payroll-master feature; the admin area shows no refunds (admin module D1).
- Refund policy percentages and deadlines: business decision pending.
- Moving packages, accounts, or other JSON records to tables.
- Dropping the JSON booking records: kept read-only after migration for rollback.

## Acceptance criteria

Schema and migration

- AC1: THE SYSTEM SHALL create the five D3 tables additively in the `soundstage` schema with access revoked from `anon` and `authenticated`.
- AC2: THE SYSTEM SHALL constrain `bookings.status` to the ten D4 values.
- AC3: THE SYSTEM SHALL reject, at the database level, two bookings for the same provider in `confirmed` or `in_progress` whose date ranges overlap.
- AC4: WHEN the migration runs, THE SYSTEM SHALL copy every JSON booking into `bookings` with a mapped status and an initial history row, skip already-migrated bookings on re-run, and leave the JSON records unchanged.
- AC5: IF a JSON booking cannot be mapped (unknown status, missing provider or dates), THEN THE SYSTEM SHALL report it and continue without inserting it.
- AC6: WHEN migrated bookings conflict on overlap, THE SYSTEM SHALL report the conflicting ids instead of failing silently or dropping either.

Creation and snapshot

- AC7: WHEN a client creates a booking, THE SYSTEM SHALL insert it as `pending` with the package name, inclusions, and price copied from the package, plus a history row, in one transaction.
- AC8: THE SYSTEM SHALL never change a booking's snapshot fields after creation, including when the package is later edited or deactivated.
- AC9: IF the dates are in the past, outside the provider's availability, or overlap a blocking booking, or the package is not published, or the provider is not approved, THEN THE SYSTEM SHALL reject the booking with a specific error and write nothing.
- AC10: IF the same create request is submitted twice (same idempotency key), THEN THE SYSTEM SHALL return the first booking and not create a second.

Transitions

- AC11: THE SYSTEM SHALL allow only the transitions in the Allowed transitions table and reject all others with an error naming the current status.
- AC12: WHEN any status changes, THE SYSTEM SHALL insert exactly one `booking_status_history` row in the same transaction; IF the history insert fails, THEN the status change SHALL roll back.
- AC13: IF a user who does not own the booking (client or provider) attempts a transition, THEN THE SYSTEM SHALL reject it without revealing booking details.
- AC14: IF two transitions on the same booking race, THEN THE SYSTEM SHALL apply at most one and reject the other based on the status at commit time.
- AC15: THE SYSTEM SHALL never allow `booking_status_history` rows to be updated or deleted by application code.

Payment

- AC16: WHEN a verified PayMongo payment of at least 30% of the snapshot price (the booking's stored `total`, see payments D7) is recorded for an `awaiting_payment` booking, THE SYSTEM SHALL move it to `confirmed`.
- AC17: IF the dates were taken by another confirmed booking before payment verification, THEN THE SYSTEM SHALL not confirm, mark the payment for refund review, and record the reason.
- AC18: THE SYSTEM SHALL never move a booking to `confirmed` from a client request, redirect, or unverified callback.
- AC19: WHEN a duplicate PayMongo confirmation arrives for an already-recorded payment, THE SYSTEM SHALL ignore it without a second status change.
- AC20: WHEN an `awaiting_payment` booking passes 48 hours without verified payment, THE SYSTEM SHALL move it to `cancelled` with reason "payment expired" before any new booking or acceptance on those dates is evaluated.

Requests and schedules

- AC21: WHEN a client submits a reschedule request on an `accepted`, `awaiting_payment`, or `confirmed` booking, THE SYSTEM SHALL insert a `pending` request; IF one is already pending, THEN THE SYSTEM SHALL reject it.
- AC22: WHEN the provider approves a reschedule request, THE SYSTEM SHALL re-check availability and overlap and update the booking dates and request in one transaction; IF the check fails, THEN nothing SHALL change and the provider SHALL see why.
- AC23: WHEN a client cancels a paid `confirmed` booking, THE SYSTEM SHALL insert a `pending` cancellation request instead of cancelling; WHEN the provider approves it, THE SYSTEM SHALL move the booking to `cancelled` with a history row.
- AC24: THE SYSTEM SHALL record each request decision once; IF a decided request receives another decision, THEN THE SYSTEM SHALL reject it.
- AC25: THE SYSTEM SHALL let a provider store weekly working days and blocked dates in `availability_schedules`, and SHALL expose one shared function that returns whether a date range is bookable for a provider.

Compatibility

- AC26: THE SYSTEM SHALL keep the exported function names in `lib/server/domain/client-bookings.ts` working against the new tables, so existing callers keep working until their modules are replaced; refund functions are callable only by the payroll master.
- AC27: THE SYSTEM SHALL map the new statuses to labels and styles used by existing UI so no screen shows an unknown status.

## Non-functional and operational checks

| Area | Requirement or `not applicable` with reason | Evidence |
| --- | --- | --- |
| Security | Server-side ownership and role checks on every write; confirmation only from verified webhook; parameterized SQL only. | Unit tests for transitions and denial cases; webhook test with forged payload. |
| Privacy | Booking queries scoped to the owner client, owner provider, or admin. | Tests for cross-user reads. |
| Accessibility | Not applicable: no UI in this feature. | — |
| Performance | Indexes on `provider_id`, `client_id`, `status`, and date range; overlap enforced by index-backed constraint. | Schema review; `EXPLAIN` on availability query. |
| Observability | History rows plus existing `recordMarketplaceAction` entries for each change; migration prints counts of migrated, skipped, and conflicting bookings. | Migration output; tests. |
| Rollback | Migration is additive; JSON records stay intact; reverting code restores the JSON path. | Migration review; `db:check`. |

## Follow-ups

- Drop the JSON booking records after production verification.
- Refund policy (percentages, deadlines).
- Admin UI for reviewing payments flagged by AC17.
- Move packages and provider data to relational tables.

## Change log

- 2026-10-09: revision 1 approved by the user.
- 2026-10-09: revision 2; changed D8, transition table (refund rows), Out of scope, AC26; affected plans none (not yet planned); reason: user approved the payroll-master module (payroll master owns refund and payout decisions, ADR 0004).
- 2026-10-09: revision 3; changed Out of scope, AC26; affected plans none (not yet planned); reason: user approved the admin module (20261009-admin-module).
- 2026-10-09: revision 4; changed D8, transition table (refund rows); affected plans none (not yet planned); reason: user approved the refund module (20261009-refund-module).
- 2026-10-17: revision 5; changed AC16 wording (snapshot price = booking `total`, payments D7 rev 4); affected plans 4 and 5; reason: user decision in payments review-2 B1.
