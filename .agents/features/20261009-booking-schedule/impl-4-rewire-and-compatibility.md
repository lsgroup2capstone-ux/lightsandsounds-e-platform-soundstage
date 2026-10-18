---
artifact: implementation-report
feature: 20261009-booking-schedule
plan: plan-4-rewire-and-compatibility.md
status: shipped
---

# Implementation report 4: Rewire actions and screens onto the tables

Scope: Phase 1 (server) and the Phase 2 pieces outside `hub-workspace.tsx`. Built on commits `a6f8a1e`, `8e8f3ff` and `bafd824`, plus the uncommitted payments plan 2 (`impl-2-checkout-and-return-page.md`). On 2026-10-17 the user chose: rewrite the JSON-dependent tests, and skip `hub-workspace.tsx` (the provider buttons are deferred).

## Files

- `lib/server/bookings/compat.ts` (new):
  - `listVisible(viewer)` scopes rows: client → own, provider → own provider email, admin and payroll master → all. It projects them into the legacy `Booking` shape:
    - `date` = start date; `durationDays` = number of days.
    - `paid` = verified total ≥ 30% of `package_price`; `downpayment` = round(0.3 × total).
    - `refund` comes from the `refund_pending` history row (the reason holds `{method, account}` as JSON) and the decision row after it.
    - Display names are read live from accounts.
  - Also: `getOwned`, `submitFeedback` (completed bookings only, once, through `feedback is null`), `requestRefund`, `reviewRefund` (payroll master only; it runs the system transition), `completedWithFeedback` (public ratings), and `completedEarnings` (withdrawals: paid, non-demo, completed).
- `lib/server/bookings/rules.ts`: adds the spec's three refund rows. `cancelled → refund_pending` is client-only, with checks `refundable` and `reason`. `refund_pending → refunded|cancelled` are system rows.
- `lib/server/bookings/core.ts`:
  - New `refundable` check: verified money > 0, the booking was cancelled by the provider or by an approved cancellation request, and no earlier refund request.
  - `cancelled_by` is now kept (`coalesce`) through refund transitions.
- `lib/server/bookings/availability.ts`: `unavailableDates` validates both dates and limits the range to 400 days (review-3 M1).
- `lib/server/domain/client-bookings.ts`: the same exported names, now async delegates to the booking module. The legacy `Confirmed`/`Cancelled`/`Completed` values map to accept, client `requestCancellation` or provider cancel ("Cancelled by provider"), and `in_progress` then `completed`. The JSON code is removed.
- `lib/server/data-service.ts`:
  - `saveClientBooking` calls `createBooking` with `v.idempotencyKey` and returns `{ id }` with no checkout.
  - `updateClientBookingStatus` delegates to the domain mapping.
  - New actions: `acceptBooking`, `declineBooking`, `startEvent`, `completeEvent`, `requestReschedule`, `decideReschedule`, `requestCancellation`, `decideCancellation`, `setWeeklyAvailability`.
  - `getBookingAvailability` returns `unavailableDates` for the next 365 days; `toggleScheduleDate` uses `toggleBlockedDate`.
  - `submitEventFeedback`, `requestBookingRefund` and `reviewBookingRefund` (now `payroll_master` only) go to compat. `ownBooking`, `sendBookingMessage` and `submitProviderReport` read the table.
  - `createWithdrawalRequest` sums payments on completed table bookings.
  - The service-delete guard checks `bookings.package_id`.
  - `visibleRecords()` is async. It builds the `soundstage-client-bookings-v3:<email>` keys from `listVisible` and never sends the JSON copies (admin included). Public ratings come from completed table rows.
  - `execute()` throws if an action changes or deletes a booking JSON key (the rollback copy).
  - Removed two writes into booking JSON (provider rename and service image propagation). The projection reads names live, and the image is snapshot-immutable.
- `lib/marketplace/mock-data.ts`: `BookingStatus` is widened to the ten D4 values plus the four legacy ones; `statusStyles` has an entry for each (AC27).
- `lib/marketplace/service-ratings.ts`: counts `completed` as well as `Completed`.
- `components/booking/booking-flow.tsx`: sends `idempotencyKey: crypto.randomUUID()` per submit and shows "Request sent. You can pay after the provider accepts." in an `aria-live` status. There is no payment tab or redirect; the payment picker is removed from this step.
- `components/client/client-dashboard.tsx`:
  - `awaiting_payment` rows show a method picker plus "Pay 30% downpayment" and "Pay in full". These call `startBookingPayment` and redirect.
  - Cancel calls `requestCancellation` and is shown for pending, accepted, awaiting_payment and confirmed.
  - Status filters and counts compare in lowercase. The old "Resume or cancel payment" link (it used a booking id as the payment id) is removed.
- `lib/booking/client-bookings.ts`: `saveClientBooking` now requires `idempotencyKey` and returns `{ id }`. Adds `requestCancellation` and `startBookingPayment`.
- Tests:
  - `tests/data/postgres-schema.cjs` "full server workflows" rewritten per T4.1.
  - `tests/bookings.cjs`: three new tests (T4.2 visibility, T4.3 styles, refund rows).

## Stop points and user decisions (2026-10-17)

1. **`components/hubs/hub-workspace.tsx`, deferred by the user.** It has uncommitted changes the implementer did not make (the hub split). The provider Accept, Decline-with-reason, Start and Complete buttons are not built. The provider screen still sends legacy values through `updateClientBookingStatus`, which the server maps, so accept, cancel and complete work, but Decline and Start have no button. Follow-up after the user commits the hub split.
2. **JSON-dependent tests, rewritten as the user approved.** None were deleted silently:
   - `tests/data/events.cjs`: was a script compiling `domain/client-bookings.ts` against a fake JSON runtime. It is now 2 `node:test` tests that call the same legacy function names on PGlite tables. They cover provider ownership, legacy status mapping, completion time, client isolation, feedback validation and duplicates, refund provenance and eligibility, the amount, duplicates and payroll-only review. Changed expectation: refund review by `admin` is now rejected (AC26).
   - `tests/data/supabase-domain.cjs`: "server derives booking identity…", "public/private snapshots…", "profile edits… date blocks…" and "availability blocks all provider packages…" now run on the PGlite transaction and seed through actions or table rows. Changed expectations:
     - status `pending` instead of `Pending`;
     - a client "Confirmed" fails with "Cannot accept" instead of a permission error;
     - availability is checked by inclusion over the 365-day window, and covers multi-day confirmed bookings, an active hold, an expired hold (not blocked), and pending or cancelled bookings (not blocked).
   - `tests/data/r2-files.cjs` "service saves verify image keys…": the "bookings follow" assertion (image copied into booking JSON) was replaced with "a booked service cannot be dropped", backed by the table query. All the image and delete assertions are kept.

## Deviations and notes

- **Refund rules added here:** `rules.ts` previously deferred refund transitions to the refund module. Plan 4 explicitly routes `requestBookingRefund`/`reviewBookingRefund` through `transition`, so the spec table's refund rows are now in `TRANSITIONS`.
- **Payroll master sees all bookings:** the design text lists only admin for "all". This keeps today's behavior, which the refund screens need.
- **`importLegacyRecords` and booking JSON:** an import that contains booking JSON keys now fails with "Booking records are read-only". Plan 5 migrates bookings instead.
- **Review-3 M2 (lock order) is not addressed.** No plan assigns it.
- **Review-3 M3 (stale pending requests) is not addressed:** no list of pending requests is exposed yet.
- **Review-2 F2:** no browser action reaches a `system` transition. `updateClientBookingStatus` uses only client and provider actors.

## Checks (run this session)

- `node --test tests/bookings.cjs`: 10/10. `tests/data/postgres-schema.cjs`: 3/3.
- `node --test tests/data/events.cjs`: 2/2. `tests/data/supabase-domain.cjs`: 7/7. `tests/data/r2-files.cjs`: 12/12.
- `npm test`: 144/145. The one failure is the known `tests/data/system-activity.cjs`.
- `npm run typecheck`: pass.
- `npm run build`: pass.
- `npm run lint`: not runnable (no `eslint.config.*`; pre-existing).

## AC evidence

- AC26: `postgres-schema` T4.1 runs the full flow through `execute()` (create → accept → webhook pays → `confirmed` by `system` → complete → feedback once) using the existing action names. `reviewBookingRefund` returns 403 for admin; the refund test covers payroll master success and rejection.
- AC27: `bookings.cjs` "every booking status has a label and style".
- Privacy (T4.2): `bookings.cjs` visibility test. In T4.1, the outsider sees no other client's booking key.
- Rollback copy: T4.1 asserts that no `soundstage-client-bookings-v3:` record is written, and `execute()` rejects changes to one.

## Not done

- The hub-workspace provider buttons (deferred by the user; stop point 1).
- Manual click-through (book → accept → pay in test mode → confirmed → start/complete → feedback). It needs the provider buttons and a webhook tunnel.

## Expert skills

- none (the plan lists none)

## Fix round 1 (review-4 B1, 2026-10-17)

- Spec revision 5 (AC16 now names `total`) and the plan's `paid` definition were updated.
- `lib/server/bookings/compat.ts:67`: `paid` = verified total ≥ 30% of `total`, which now matches `downpayment`. The core checks were changed in payments fix round 1 (same tree).
- Review-4 minors m1-m6 are not addressed in this round.
- Checks (run this session): `node --test tests/paymongo-checkout.cjs` 9/9; `node --test tests/migrate-bookings.cjs` 6/6; `npm test` 151/152 (only the known `tests/data/system-activity.cjs`); `npx tsc --noEmit -p .` exit 0. Lint not runnable (no ESLint config); build not rerun.

## Fix round 2 (review-4 minors, 2026-10-17)

- m1 (`data-service.ts`, admin promotion): table bookings now count as business data.
- m2 (`domain/client-bookings.ts`): `Completed` reads the row status with `lockOwned` instead of parsing error text.
- m3: lowercase `declined` is no longer accepted by `updateClientBookingStatus`. Declines go through `declineBooking(id, reason)`.
- m4: `getAllBookings()` requires admin or payroll master.
- m6: `design.md` compatibility projection now lists the payroll master as seeing all bookings.
- m5 (user approved editing the uncommitted hub split, 2026-10-17): `components/hubs/provider/provider-content.tsx` now has Accept, Decline (reason prompt), Start, Complete and Cancel (with a confirm prompt) buttons, wired to `acceptBooking`, `declineBooking`, `startEvent`, `completeEvent` and the legacy provider cancel. The list reloads from the server after each action. Status comparisons are lowercase, the filters cover the D4 values, and date blocking counts `confirmed` and `in_progress`. These comparisons were silently broken by the lowercase statuses; the same fix is applied to the admin overview pending count (`components/hubs/admin/admin-content.tsx`). The click-through is still manual.
- Checks (run this session): `npm test` 153/153; `npx tsc --noEmit -p .` pass; `npm run build` pass. Lint not runnable (no ESLint config, pre-existing).

## Fix round 3 (review-6, 2026-10-17)

- M1 (rounding): fixed together with payments fix round 3 (`downpaymentFor`).
- Provider cancel needs a real reason. There is a new `cancelEvent(id, reason)` action (`data-service.ts`, provider `confirmed → cancelled` transition), and the Cancel button asks for the reason the way Decline does. The legacy `updateClientBookingStatus("Cancelled")` mapping remains for old callers.
- Provider filters now include `refund_pending` and `refunded`.
- Other screens that compared capitalized statuses (the user asked to "fix everything"):
  - `components/communications/event-notifications.tsx`: completed and cancelled checks are now lowercase. This file has uncommitted user edits; only those comparisons changed.
  - `components/payment/refunds-panel.tsx`: the client refund list matches `cancelled`, `refund_pending` and `refunded`.
  - `lib/data/hub-data.ts` `hubStatus`: colors for the lowercase statuses.
  - The client refund list still shows only provider-cancelled bookings, or bookings that already have a refund. Clients cancelled through an approved cancellation request are allowed by the server, but they do not appear in this list.
- Checks (run this session): `npm test` 154/154; `npx tsc --noEmit -p .` pass; `npm run build` pass.

## Fix round 4 (user decision on the refund list, 2026-10-17)

- The user chose to show refund-eligible bookings that were cancelled through an approved cancellation request.
- `compat.ts`: the projection sets `refundEligible: true` when the status is `cancelled`, verified money is > 0, no earlier refund request exists, and either the provider cancelled or an approved cancellation request exists. This mirrors core's `refundable` check.
- `Booking` gains the optional `refundEligible` field (`mock-data.ts`).
- `components/payment/refunds-panel.tsx` (client view) lists `refund || refundEligible`.
- Test: `bookings.cjs` refund test asserts eligible after a provider cancel, not eligible after a request, and not eligible for an unpaid client cancel. The approved-request path is covered only by the SQL; it has no test.
- Checks (run this session): `npm test` 154/154; `npx tsc --noEmit -p .` pass; `npm run build` pass.
