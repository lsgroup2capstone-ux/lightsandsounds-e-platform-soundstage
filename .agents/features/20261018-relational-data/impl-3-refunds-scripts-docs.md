---
artifact: implementation
schema: 1
feature: 20261018-relational-data
revision: 1
status: superseded
risk: high-risk
---

# Implementation 3: Refund actions on refund tables, scripts, vault

> Superseded on 2026-10-18 by spec revision 2 and plan-4-core-tables.md (the 11 core tables). Kept for history.

- Plan: `plan-3-refunds-scripts-docs.md`
- Part: all
- Date: 2026-10-18
- Spec revision: 1

## Summary

`requestBookingRefund` inserts a `requested` refund (full verified amount in
centavos) plus history; `reviewBookingRefund` Paid records `approved` then
`completed`, allocates the amount over paid payments newest first, and moves
the booking to `refunded`; Rejected records `rejected` with remarks. The
booking projection reads refunds from the table. Scripts read tables instead
of `soundstage.records` for live data.

## Files changed

| File | Change |
| --- | --- |
| `lib/server/bookings/compat.ts` | refund request/review on `refunds`; projection from latest refund; paid total includes refunded payments for display |
| `scripts/db/migrate-bookings.cjs` | writes `booking_feedback` and `refunds` (after payments); history reasons are plain text; export reads tables |
| `scripts/auth/auth-inventory.cjs`, `migrate-identities-to-profiles.cjs`, `migrate-clerk-to-supabase.cjs` | read `accounts` |
| `scripts/db/clear-client-provider-data.cjs` | clears collection tables; never touches booking/payment/refund tables |
| `scripts/db/database-check.cjs` | reports table counts |
| `tests/data/refund-actions.cjs` | new: AC12 evidence (2 tests) |
| `tests/migrate-bookings.cjs`, `tests/auth/migrate-identities.cjs` | table assertions |
| `.agents/docs/Database.md`, `.agents/state/tasks.md` | vault and index |

## Deviations from the plan

- A legacy Paid refund without a migrated payment (`BK-RFDP` in the test data) is reported by `migrate-bookings` as unmappable ("completed refund without a migrated payment") because the database refuses a completed refund above verified money (refund AC13). Its booking history rows are kept.
- Paid references are limited to 100 characters (refund D7 column limit); longer input is refused with a message.

## Checks (actually run)

| Command | Result |
| --- | --- |
| `node --test tests/data/refund-actions.cjs` | pass 2/2 |
| `node --test tests/migrate-bookings.cjs` | pass 6/6 |
| `npm run typecheck` | pass |
| `npm test` | pass 163/163 |
| `npm run build` | pass |

## Manual checks

- Not done: no script was run against a real database (not authorized).

## Notes for the reviewer

- Legacy `booking_status_history` rows that already hold JSON text stay as written (append-only, ADR 0004); new writes add none.
