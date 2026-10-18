---
artifact: review
schema: 1
feature: 20261009-booking-schedule
revision: 1
status: changes-requested
risk: high-risk
---

# Review 4: Rewire actions and keep existing screens working

- Plan: `plan-4-rewire-and-compatibility.md`
- Report: `impl-4-rewire-and-compatibility.md`
- Spec: `spec.md` (revision 4); design: `design.md`
- Reviewer: Claude Code, fresh review session
- Independent from implementation: yes (did not implement in this session)
- Baseline: `bafd824` plus the uncommitted working tree. The tree also holds payments plan 2 and booking plan 5 work, so `data-service.ts` and the `tests/data/*` files mix those plans. This plan is judged on `lib/server/bookings/compat.ts` (new), `rules.ts`, `core.ts`, `availability.ts`, `domain/client-bookings.ts`, the booking actions and `visibleRecords`/`execute` in `data-service.ts`, `mock-data.ts`, `service-ratings.ts`, `booking-flow.tsx`, `client-dashboard.tsx`, `lib/booking/client-bookings.ts`, and the listed tests. The `hub-workspace.tsx` diff (+10/−424) is the user's hub split, not this plan.

## Checks run in this session

- `node --test tests/bookings.cjs tests/data/postgres-schema.cjs tests/data/events.cjs tests/data/supabase-domain.cjs tests/data/r2-files.cjs`: 34/34 pass.
- `npm test` (same tree, earlier in this session): 149/150. The only failure is `tests/data/system-activity.cjs`, a known failure that predates this work.
- `npx tsc --noEmit -p .`: exit 0 (same tree).
- `npm run lint`: not run. No ESLint config exists, and that problem predates this work.
- `npm run build`: not rerun here. The report says it passed.

## Verdict: blocked (the same user decision as payments review-2 B1)

### Blocker

**B1. The amount basis is inconsistent in the projection.** `compat.ts:62` shows `downpayment = round(0.3 × total)`, but `compat.ts:62` also sets `paid = paidTotal ≥ 0.3 × package_price`. The checkout (`payments/checkout.ts`) and the confirm checks (`core.ts:158,177,197`) both use `package_price`. For a multi-day or out-of-area booking, the dashboard shows a downpayment larger than the amount the client is actually charged. The plan text prescribes exactly this mix, so this is a decision gap, not an implementer error. It is the same question as `20261009-paymongo-payments/review-2-checkout-and-return-page.md` B1: which price is spec D7's "snapshot price"?
- Required: the user picks the basis (recommended: `total`). Then make `compat.ts` `paid`/`downpayment`, `core.ts` and `checkout.ts` all use that one value, and add a test where `total ≠ package_price`.

### Major

- none

### Minor (do not block)

- m1. `data-service.ts:348`: when a user is promoted to admin, the code still checks booking **JSON** to decide whether to drop their account record. A client whose bookings exist only in the tables now counts as having "no business data", so their account row is removed and their name shows as an email in projections. Fix: also check `soundstage.bookings` for `client_email`/`provider_email`.
- m2. `domain/client-bookings.ts:36`: the legacy `Completed` path detects "already started" by matching the error-message regex `/that is in_progress$/`. Fix: read the row status first, or check `findRule`, instead of parsing error text.
- m3. `domain/client-bookings.ts:40`: a lowercase `declined` passed without a reason always fails the `reason` check, with no way to send a reason. Fix: send declines to `declineBooking` only, or accept a reason argument.
- m4. `domain/client-bookings.ts:16`: `getAllBookings()` returns every booking with an admin viewer and no role check. No server caller uses it today (only the browser twin has callers). Fix: require admin or payroll master, or remove the export.
- m5. Partial Phase 2 (user decision, 2026-10-17): `hub-workspace.tsx` provider buttons are not built, so providers have no Decline or Start control. Record this as a follow-up in `tasks.md` and make sure it is done before deploying (design U1).
- m6. Payroll master sees all bookings (`compat.ts:84`). That keeps today's behavior, but the design lists only admin. Add it to the design when the payroll-master module is planned.

## Decisions check

- D1 (compatibility): pass. Existing exported names and action names work on the tables. The JSON booking keys are never sent and are read-only in `execute()` (`data-service.ts:372-375`).
- D4: pass. The ten statuses are used, and the refund rows match the spec table (`rules.ts:22-24`, spec lines 68-70).
- D6: pass. Confirmation still needs the verified downpayment, whatever the basis turns out to be (B1).
- D8: pass. `reviewRefund` is payroll master only (`compat.ts:117`) and runs the system transition. `refundable` requires verified money, a provider-side cancellation and a single request (`core.ts:160-167`).

## AC / task mapping

| Item | Evidence | Result |
| --- | --- | --- |
| AC26 / T4.1 | `postgres-schema` "full server workflows" (create → accept → webhook → confirmed → complete → feedback through `execute()`; refund admin 403, `:121`); `events.cjs` 2 tests | pass |
| T4.2 (privacy) | `bookings.cjs` visibility test; `compat.ts:80-88` scoping | pass |
| AC27 / T4.3 | `bookings.cjs` "every booking status has a label and style" | pass |
| T4.4 (UI) | `booking-flow.tsx`, `client-dashboard.tsx` done; `hub-workspace.tsx` deferred by user | partial (m5); manual click-through not done |
| Rollback copy | T4.1 assertion plus the `execute()` guard | pass |

## Scope

- Refund rules in `rules.ts` and the `refundable` check in `core.ts` go beyond the plan's file list. The report says so, and they are needed for the plan's `requestBookingRefund`/`reviewBookingRefund` routing. Accepted.
- The `availability.ts` range limit fixes review-3 M1. It is small and the report says so. Accepted.
- Replaced tests are listed in the report and none were deleted silently.

## Unverified manual / operational checks

- Local click-through in PayMongo test mode: book → accept → pay → confirmed → start/complete → feedback. It needs the hub buttons (m5) and a webhook tunnel.
- `npm run build` was not rerun by the reviewer.

## Expert skills

- none applicable (the plan lists none)

## User decision (2026-10-17)

- B1 resolved: the user chose the recommendation. All payment amounts use the booking **`total`** (multi-day price plus transportation fee) as spec D7's "snapshot price".
- Verdict is now **changes-requested**. Required, in order:
  1. Update spec D7 to say "`total`" and add a changelog row. Update the affected plans (payments plan 2, booking plan 4, booking plan 5) to match. Get approval for both.
  2. `/sdd-implement` fix round: `payments/checkout.ts` (downpayment, full and balance), `bookings/core.ts:158,177,197` (downpayment checks), `bookings/compat.ts:62` (`paid` flag) and `scripts/db/migrate-bookings.cjs` (`package_price`/export `paid`) all use one basis. Add a test where `total ≠ package_price`.
