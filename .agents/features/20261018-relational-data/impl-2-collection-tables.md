---
artifact: implementation
schema: 1
feature: 20261018-relational-data
revision: 1
status: superseded
risk: high-risk
---

# Implementation 2: Collection tables, table-backed record store, booking JSONB removal

> Superseded on 2026-10-18 by spec revision 2 and plan-4-core-tables.md (the 11 core tables). Kept for history.

- Plan: `plan-2-collection-tables.md`
- Part: all
- Date: 2026-10-18
- Spec revision: 1

## Summary

Every collection that lived in `soundstage.records` now has its own table
with keys and foreign keys. `execute()` loads the record keys from the tables
and writes per-item differences back; it never reads or writes
`soundstage.records`. Schema version 6 copies existing JSON once (accounts,
applications, documents, services, subscriptions, subscription payments,
activity, messages, reports, withdrawals, notification reads, blocked dates,
and refunds kept as JSON text in booking history), then copies and drops
`bookings.package_inclusions` and `bookings.feedback`. The only JSON column
left is the untouched legacy `records.value`.

## Files changed

| File | Change |
| --- | --- |
| `database/schema.sql` | 12 collection tables with FKs; `booking_inclusions` append-only; one-time v6 copy; booking jsonb columns copied then dropped; snapshot trigger no longer reads inclusions; version 6 |
| `lib/server/db/record-store.ts` | new: `loadRecords`, `saveRecords` (diff by item id per collection) |
| `lib/server/data-service.ts` | `execute` uses the record store and reloads after saving |
| `lib/server/auth/profiles.ts` | imported role read from `accounts` |
| `lib/server/bookings/core.ts` | inclusions inserted as `booking_inclusions` rows |
| `lib/server/bookings/compat.ts` | feedback read/written through `booking_feedback` |
| `tests/helpers/record-tables.cjs` | new: seed/read records through the store |
| `tests/data/record-tables.cjs` | new: AC1, AC3, AC4, AC5 evidence (3 tests) |
| `tests/data/backup.cjs`, `tests/paymongo-webhook.cjs`, `tests/bookings.cjs`, `tests/data/postgres-schema.cjs`, `tests/auth/profiles-schema.cjs` | moved from records to tables; version 6; `email_notifications` column |

## Deviations from the plan

- Foreign keys added beyond the plan text after the user's mid-session instruction "it should be rdbms" (2026-10-18): services, subscriptions, subscription payments, withdrawals and notification reads reference `accounts(role, email)` (`ON DELETE CASCADE`); messages and reports reference `bookings(id)` (`uuid`, `ON DELETE RESTRICT`). The copy maps legacy message/report booking ids through `bookings.legacy_id` and skips orphans (they remain in `soundstage.records`).
- `execute` reloads the keys from tables after saving so responses reflect rows that actions change directly (blocked dates). One extra set of reads per request.

## Checks (actually run)

| Command | Result |
| --- | --- |
| `node --test tests/data/record-tables.cjs` | pass 3/3 |
| `npm run typecheck` | pass |
| `npm test` | pass 163/163 |
| `npm run build` | pass (it rewrote `next-env.d.ts`; restored) |

## Manual checks

- Done: none.
- Not done: browser click-through of every role (no screen changes intended); `npm run db:init` on a copy of the real database to confirm the v6 copy accepts the real data (not authorized; recommended before deploy).

## Notes for the reviewer

- Deploy order: `npm run db:init` (runs the copy) and the code must ship together; old code cannot run after v6 because `bookings.feedback`/`package_inclusions` are dropped (rollback in plan 2).
- A legacy row that violates a table constraint aborts the whole schema transaction; filters skip malformed items instead of weakening constraints.
- Unknown record keys now throw `Unsupported record key` instead of being stored as JSON; restoring an old backup that contains booking JSON keys still fails as before.
