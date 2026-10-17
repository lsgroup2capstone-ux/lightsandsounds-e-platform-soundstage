---
artifact: implementation-report
feature: 20261009-booking-schedule
plan: plan-3-requests-and-availability.md
status: ready-for-review
---

# Implementation report 3: Reschedule, cancellation requests and availability

Scope: the whole plan (phases 1 and 2). Built on plan 2, which is approved but not yet shipped. The user's uncommitted folder restructure is still in the tree, so new files import the restructured paths.

## Files

- `lib/server/bookings/availability.ts` (new, 58 lines): `setWeeklyDays`, `toggleBlockedDate`, `unavailableDates`, and the shared `validDate`.
- `lib/server/bookings/requests.ts` (new, about 110 lines): `requestReschedule`, `decideReschedule`, `requestCancellation`, `decideCancellation`.
- `lib/server/bookings/core.ts`: exported `assertBookable` and `lockOwned`, and added `paidTotal()`, which reads the registered paid-total function. There is no behavior change.
- `tests/bookings-requests.cjs` (new) and `package.json` `test` script (appended).

## Deviations and notes

- **Decision reasons:** `decideReschedule`/`decideCancellation` take no reason. The request's `reason` column holds the client's reason and is never overwritten by the decision. The plan listed `reason?` on both, but the schema has a single `reason` column.
- **Reschedule rules:** a reschedule request runs `isBookable` at request time and again on approval (AC22). The booking's hold (`hold_expires_at`) is not reset by a reschedule.
- **Who cancelled:** an approved cancellation calls `transition(confirmed → cancelled)` as `system` with reason "cancellation approved by provider", then sets `cancelled_by = 'client'` in the same transaction (the plan asks for that value). `transition` stores the actor role by default.
- **Request ownership:** a non-owner provider gets `404 Request not found`, and a non-provider gets 403.
- **Review-2 F2:** `transition(confirmed → cancelled, system)` is still exported and callable directly. Plan 4 must expose cancellation only through `requestCancellation`/`decideCancellation` and must not expose a system transition.
- **Request shapes:** `requestCancellation` on an unpaid `pending|accepted|awaiting_payment` booking returns the transition result `{id, status: "cancelled"}`, not a request row.

## Checks (run this session)

- `node --test tests/bookings-requests.cjs`: 4/4 pass.
- `npm test`: 125/126 pass. The failure is `tests/data/system-activity.cjs`, which already fails at HEAD (review 1).
- `npm run typecheck`: pass.

## AC evidence

- AC21: test "reschedule requests…" (pending row, second rejected, non-owner 404, `pending` booking rejected).
- AC22, AC24: test "approving a reschedule…" (dates move; taken dates → "These dates are already booked", and the request stays pending and undecided because the transaction rolled back; double decision rejected; other provider 404).
- AC23, AC24: test "cancelling…" (unpaid instant; paid confirmed → pending request, booking stays `confirmed`; approve → `cancelled` + system history row, `cancelled_by='client'`; decline leaves the booking confirmed).
- AC25: test "availability…" (weekly days, empty list = every day, blocked toggle, `unavailableDates` includes blocked and booked dates, input validation).

## Not done

- No browser actions (plan 4), no JSON schedule migration (plan 5). There are no manual checks.

## Expert skills

- none (plan lists none).
