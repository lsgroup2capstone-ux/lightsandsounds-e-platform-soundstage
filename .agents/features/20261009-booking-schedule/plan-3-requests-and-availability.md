---
artifact: plan
schema: 1
feature: 20261009-booking-schedule
revision: 1
status: plan-approved
risk: high-risk
---

# Plan 3: Reschedule, cancellation requests and availability

- Feature: `.agents/features/20261009-booking-schedule/spec.md`
- Design: `.agents/features/20261009-booking-schedule/design.md`
- Implements decisions: D9, D10
- Spec revision: 4
- Depends on: plan 2
- Status: plan-approved
- Estimate: about 300 lines of diff

## Goal

The server-side request workflows and availability storage exist in `lib/server/bookings/requests.ts` and `lib/server/bookings/availability.ts`, built on plan 2's `transition` and `isBookable`.

## Evidence (checked in the repository)

- `lib/server/data-service.ts:178-185`: `toggleScheduleDate` stores blocked dates as JSON under `soundstage-schedule:<email>`. It is replaced by `availability_schedules` (plan 4 rewires the action; plan 5 migrates the dates).
- `lib/server/data-service.ts:163-177`: `getBookingAvailability` returns unavailable dates for a package and must keep returning `string[]` (plan 4).
- Spec D9: one pending request per type, a single decision, and a re-check on reschedule approval.

## Phases

### Phase 1: Availability (`availability.ts`)

- `setWeeklyDays(actor, weekdays: number[])`: provider only; replaces the provider's weekly rows; validates the integers 0–6.
- `toggleBlockedDate(actor, date)`: provider only; inserts or deletes the `blocked` row.
- `unavailableDates(providerEmail, fromDate, toDate)`: blocked dates, non-working weekdays and dates covered by blocking bookings. This is for the `getBookingAvailability` compatibility action.
- `isBookable` from plan 2 reads these rows. This is the one shared function AC25 asks for.

### Phase 2: Requests (`requests.ts`)

- `requestReschedule(actor, bookingId, newStart, durationDays, reason)`:
  - Client owner only.
  - The booking status must be in `accepted|awaiting_payment|confirmed`.
  - The new dates must pass `isBookable(…, excludeId=bookingId)`.
  - Insert `pending`. A unique-index violation becomes "A reschedule request is already pending".
- `decideReschedule(actor, requestId, approve, reason?)`:
  - Provider owner only.
  - `UPDATE … SET status, decided_by, decided_at WHERE id=$1 AND status='pending'`. Zero rows → "This request was already decided" (AC24).
  - On approve: re-run `expireHolds`, then `isBookable(excludeId)`, then update the booking dates in the same transaction. On failure, throw with the reason so the whole transaction rolls back (AC22).
- `requestCancellation(actor, bookingId, reason)`:
  - Client owner.
  - If the booking is unpaid (`paidTotal = 0`) and in `pending|accepted|awaiting_payment`, call `transition(→cancelled)` directly.
  - If the booking is `confirmed` and paid, insert a `pending` cancellation request (AC23).
  - Any other status gets the transition error.
- `decideCancellation(actor, requestId, approve, reason?)`:
  - Provider owner; single decision as above.
  - On approve: `transition(confirmed → cancelled)` as `system`, with reason "cancellation approved by provider" and `cancelled_by='client'`.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T3.1 | plan 2 | `requests.ts` | AC21 | `tests/bookings-requests.cjs`: request on `confirmed` → pending row; second → rejected; on `pending` booking → rejected |
| T3.2 | T3.1 | `requests.ts` | AC22 | approve when free → dates moved and request approved; approve when another booking took the dates → nothing changed, error names the reason |
| T3.3 | T3.1 | `requests.ts` | AC23 | paid confirmed cancel → pending request, booking still `confirmed`; approve → `cancelled` + history row |
| T3.4 | T3.1 | `requests.ts` | AC24 | deciding twice → rejected |
| T3.5 | none | `availability.ts` | AC25 | weekly days and blocked dates stored; `isBookable` false on a non-working day and a blocked date; no weekly rows → every day bookable |

## Tests

- New `tests/bookings-requests.cjs` added to `npm test`.

## Out of scope

- From the spec:
  - UI pages.
  - Refund decision UI.
  - Refund policy.
  - Moving packages or accounts to tables.
  - Dropping JSON records.
- Deferred:
  - Browser actions for these functions (plan 4).
  - Migration of `soundstage-schedule:` JSON (plan 5).

## Acceptance

- Spec: AC21, AC22, AC23, AC24, AC25.
- Technical: no file over 300 lines.

## Verification

- Routine local checks: `npm test`, `npm run typecheck`.
- Scoped operations: none.
- Manual: none.

## Expert skills to apply

- none

## Risks and stop points

- If a provider needs partial-day availability (times) → stop. The spec only covers days.
