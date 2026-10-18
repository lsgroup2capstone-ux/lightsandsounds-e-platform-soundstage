---
artifact: implementation
schema: 1
feature: 20261018-relational-data
revision: 1
status: superseded
risk: high-risk
---

# Implementation 1: Module tables and database guards

> Superseded on 2026-10-18 by spec revision 2 and plan-4-core-tables.md (the 11 core tables). Kept for history.

- Plan: `plan-1-module-tables.md`
- Part: all
- Date: 2026-10-18
- Spec revision: 1

## Summary

`database/schema.sql` now creates the refund, payout, audit, feedback,
notification and platform-settings tables with their rules enforced by the
database: delete/truncate guards on the ADR 0004 tables (including `payments`
and `payment_events`), append-only histories and audit, refund transition and
over-refund guards, the attachment limit, payout amount checks, draft-only
edits, one non-rejected payout per booking, and notification read-only rows.

## Files changed

| File | Change |
| --- | --- |
| `database/schema.sql` | shared guard functions, `audit_log` + `audit_log_changes`, refund tables, payout tables, `booking_feedback`, notifications + outbox, `profiles.email_notifications`, `platform_settings`, `payments_refund_within_amount` check |
| `tests/data/module-tables.cjs` | new: AC8-AC11 evidence (4 tests) |
| `package.json` | test list includes the new file |

## Deviations from the plan

- Tests live in a new `tests/data/module-tables.cjs` instead of new blocks in `tests/data/postgres-schema.cjs` (keeps that file readable). Same evidence.
- `schema_versions` 6 is added by plan 2 as planned; plan 1 adds no marker.

## Checks (actually run)

| Command | Result |
| --- | --- |
| `node --test tests/data/module-tables.cjs` | pass 4/4 |
| `npm run typecheck` (`tsc --noEmit`) | pass (run after plan 3) |
| `npm test` | pass 163/163 (run after plans 1-3 together) |
| `npm run build` | pass (run after plans 1-3 together) |

Pre-existing failures confirmed on the previous commit: none (baseline `npm test` 154/154 before any change).

## Manual checks

- Done: none.
- Not done: `npm run db:init` against Supabase (not authorized; also needs `btree_gist`, already a prerequisite).

## Notes for the reviewer

- `soundstage.guard_table(regclass, append_only)` installs row and `TRUNCATE` triggers; reruns replace them.
- Refund over-refund check compares completed `approved_amount_centavos` against `round(payments.amount * 100)` for `paid|partially_refunded|refunded` payments.
- Payout rejection voids its items in an `AFTER UPDATE` trigger, which frees the bookings for the partial unique index.
- `schema.sql` is now ~930 lines; project.md has no filled size limit, but a reviewer may want it split by version later.
