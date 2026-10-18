# Review 6: Rewire and compatibility, fix rounds 1-2

- Plan: `plan-4-rewire-and-compatibility.md`; spec rev 5 (AC16 names `total`)
- Prior round: `review-4-rewire-and-compatibility.md` (B1, m1-m6)
- Fixes reviewed: `impl-4` fix rounds 1-2, including the provider buttons in `components/hubs/provider/provider-content.tsx` (user-approved edit of the uncommitted hub split) and the admin pending count in `components/hubs/admin/admin-content.tsx`.
- Reviewer independence: fresh reviewer agent.
- Baseline: uncommitted tree on `bafd824`; `components/hubs/*` is otherwise the user's own work and was not judged.

## Checks run in this session

- `npm test` 153/153; `npx tsc --noEmit -p .` exit 0; `npm run build` exit 0; lint not runnable (pre-existing).

## Verdict: changes-requested

## Prior findings

- B1 fixed: `compat.ts:67` `paid` and `downpayment` both use `total`; core checks use `coalesce(total, package_price)`.
- m1 fixed: `data-service.ts:349` checks `soundstage.bookings`.
- m2 fixed: `domain/client-bookings.ts:38` reads the status via `lockOwned`.
- m3 fixed: `updateClientBookingStatus` no longer accepts `declined`; declines go only through `declineBooking` (`data-service.ts:212`, provider-content `withReason`). No caller passes lowercase `declined` (grep).
- m4 fixed: `client-bookings.ts:17-19` allows admin and payroll master only.
- m5 fixed: provider-content buttons match the spec transition table: pending has Accept and Decline (reason prompt); confirmed has Start and Cancel; in_progress has Complete; awaiting_payment has no provider action. The server still enforces every transition.
- m6 fixed in `design.md`.

## Major

**M1. Downpayment rounding mismatch (shared with payments review-3 M1).** `compat.ts:67` shows `downpayment = round(0.3 * total)` but `paid = paid >= 0.3 * total`; `core.ts:158,177,197` use the same unrounded threshold. A client who pays the displayed downpayment on, for example, total 13801 (4140 < 4140.3) is shown "Unpaid" and is never confirmed.

Required fix: one `downpaymentFor(total)` helper used by `compat.ts:67`, `core.ts:158,177,197` and `payments/checkout.ts:55`; add a test with a total like 13801.

## Minor

- m1. Provider cancel (`provider-content.tsx:73`) sends the fixed reason "Cancelled by provider" (`client-bookings.ts:36`); the spec requires a reason. Prompt for it as Decline does.
- m2. `provider-content.tsx:66` filters omit `refund_pending` and `refunded`; those bookings appear only under "All".
- m3. Outside plan scope, but broken by the lowercase statuses: `components/communications/event-notifications.tsx:25` still compares `"Completed"` and `"Cancelled"`, so admin and client event notifications are empty. Report it to the owner of that file (it has the user's uncommitted edits).

## Unverified manual / operational checks

- Provider, client and admin UI click-through of every button.

## Expert skills

None beyond the sdd-review workflow.
