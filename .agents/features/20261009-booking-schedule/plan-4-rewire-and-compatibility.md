---
artifact: plan
schema: 1
feature: 20261009-booking-schedule
revision: 1
status: plan-approved
risk: high-risk
---

# Plan 4: Rewire actions and keep existing screens working

- Feature: `.agents/features/20261009-booking-schedule/spec.md`
- Design: `.agents/features/20261009-booking-schedule/design.md`
- Implements decisions: D1 (compatibility), D8 (refund functions restricted)
- Spec revision: 5
- Depends on: plans 2 and 3; paymongo-payments plans 1 and 2 (`startBookingPayment` must exist before booking creation stops starting a checkout)
- Status: plan-approved
- Estimate: about 380 lines of diff; split point: Phase 1 (server) and Phase 2 (UI) as two parts

## Goal

Every existing booking action and screen runs on the tables. Clients request, providers accept, and clients then pay from the dashboard. No screen shows an unknown status.

## Evidence (checked in the repository)

- `lib/server/data-service.ts:258-295`: the `saveClientBooking` and `updateClientBookingStatus` actions to replace. The current create calls `startPayment` at line 279.
- `lib/server/data-service.ts:45-55`: `ownBooking` reads JSON. Replace it with the booking module's owner lookup.
- `lib/server/data-service.ts:163-185`: `getBookingAvailability`, `toggleScheduleDate`.
- `lib/server/data-service.ts:296-299`: `submitEventFeedback`, `requestBookingRefund`, `reviewBookingRefund`. Spec AC26 says refund review is payroll master only (today it is `admin`).
- `lib/server/data-service.ts:322-336`: `createWithdrawalRequest` sums `Completed` paid bookings. Switch it to table rows with status `completed` and `paidTotal`.
- `lib/server/data-service.ts:342-368`: `visibleRecords()` builds booking keys from JSON.
- `lib/server/domain/client-bookings.ts:1-116`: server JSON functions, imported by `lib/system-activity.ts:2` through the browser twin `lib/client-bookings.ts`.
- `lib/mock-data.ts:3,256-261`: `BookingStatus` (4 values) and `statusStyles`.
- `components/booking/booking-flow.tsx:18`: calls `saveClientBooking` and expects `checkoutUrl` (427 lines).
- `components/dashboard/client-dashboard.tsx:80`: cancel calls `updateClientBookingStatus(id, "Cancelled")`. **This file has uncommitted changes the planner did not make (git status 2026-10-13).**
- `components/hubs/hub-workspace.tsx:18`: provider and admin hub status updates. **Also has uncommitted changes.**

## Phases

### Phase 1: Server (`data-service.ts`, `lib/server/domain/client-bookings.ts`)

- `saveClientBooking(value)`: call `createBooking` with idempotency key `v.idempotencyKey` (the browser generates one per form submit). Return `{ id }`. Keep the pricing fields.
- `updateClientBookingStatus(id, status)`: map the legacy values to the new functions, so old buttons keep working:
  - `Confirmed` from a provider → accept;
  - `Cancelled` from a client → `requestCancellation`;
  - `Cancelled` from a provider → provider cancel (reason "Cancelled by provider");
  - `Completed` → `in_progress` then `completed` if needed.
  - New lowercase values are also accepted and passed to `transition`.
- Add the actions `acceptBooking`, `declineBooking(id, reason)`, `startEvent`, `completeEvent`, `requestReschedule`, `decideReschedule`, `requestCancellation`, `decideCancellation` and `setWeeklyAvailability`. They are thin wrappers that validate the argument types.
- `getBookingAvailability(packageId)`: returns `unavailableDates` for the next 365 days. `toggleScheduleDate` → `toggleBlockedDate`.
- `ownBooking` reads the table. `submitEventFeedback` writes the plan-1 `bookings.feedback` column (completed bookings only, once).
- `requestBookingRefund` → `transition(cancelled → refund_pending)` by the client owner, keeping the existing method and account validation; the refund details go in history `reason`.
- `reviewBookingRefund`: `requireRole("payroll_master")`, then `refunded` or back to `cancelled` (AC26, D8).
- `lib/server/domain/client-bookings.ts`: keep the exported names. Each delegates to the booking module. The JSON-reading code is removed.
- `visibleRecords()`: build the `soundstage-client-bookings-v3:<email>` keys from `listVisible(actor)` in the `Booking` shape: `date` = start, `durationDays` = days, `paid` = `paidTotal ≥ 0.3 × total` (snapshot price, payments D7 rev 4; core confirm checks use the same value), `downpayment` = `round(0.3 × total)`. Booking JSON keys in storage are no longer sent.
- In `execute()`, bookings JSON keys are read-only after this plan: if an action tried to change one, throw. This protects the rollback copy.

### Phase 2: UI (minimal, existing components only)

- `lib/mock-data.ts`: widen `BookingStatus` to the ten D4 values while keeping the four legacy capitalized values in the union for old data; add `statusStyles` for each (AC27).
- `booking-flow.tsx`: send `idempotencyKey: crypto.randomUUID()` per submit. On success, show "Request sent. You can pay after the provider accepts." and do not redirect.
- `client-dashboard.tsx`: for `awaiting_payment`, show "Pay 30% downpayment" and "Pay in full" buttons. They call `startBookingPayment` (payments plan 2) and redirect to the returned URL. The cancel button calls `requestCancellation`.
- `hub-workspace.tsx`: the provider sees Accept, Decline (asks for a reason), Start and Complete, mapped to the new actions. Status comparisons use the new values.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T4.1 | plans 2–3, payments plan 2 | `data-service.ts`, `domain/client-bookings.ts` | AC26 | `tests/postgres-schema.cjs` "full server workflows" updated: client create → provider accept → webhook fixture pays → `confirmed` → complete → feedback, all through `execute()`; `reviewBookingRefund` as admin → 403, as payroll_master → ok |
| T4.2 | T4.1 | `data-service.ts` `visibleRecords` | none (privacy NFR) | client B sees none of client A's bookings; provider sees only own; admin sees all |
| T4.3 | none | `lib/mock-data.ts` | AC27 | `tests/bookings.cjs`: every D4 status has a `statusStyles` entry; `npm run typecheck` |
| T4.4 | T4.1 | three components | none | manual click-through below; `npm run build` |

## Tests

- Update `tests/postgres-schema.cjs`, `tests/events.cjs` and `tests/system-activity.cjs` where they seed booking JSON and expect JSON writes. Seed through the actions instead. Any test that no longer applies is replaced, never deleted silently; list each in the report.

## Out of scope

- From the spec:
  - Full client and provider UI pages (client and provider modules).
  - Refund decision UI (payroll-master).
  - Refund policy.
  - Moving packages or accounts to tables.
  - Dropping JSON booking records.
- Not in this plan: reschedule UI (client and provider modules).

## Acceptance

- Spec: AC26, AC27.
- Technical:
  - The rollback copy (JSON records) is never written after this plan.
  - Not deployable alone: deploy only after plan 5 and both payments plans ship (design U1).

## Verification

- Routine local checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
- Scoped operations: none.
- Manual (local, PayMongo test mode with a test webhook reaching the machine):
  1. The client books.
  2. The provider accepts.
  3. The client pays the downpayment.
  4. The booking shows Confirmed.
  5. The provider starts and completes the event on or after its date.
  6. The client leaves feedback.

## Expert skills to apply

- none

## Risks and stop points

- **Stop before editing** `client-dashboard.tsx` or `hub-workspace.tsx` if they still have changes the implementer did not make. Ask the user to commit or stash them (AGENTS.md).
- If existing tests depend on JSON booking internals beyond simple seeding → list them and ask before rewriting.
- If the diff passes about 400 lines → ship Phase 1 and Phase 2 as separate reviewed parts.
