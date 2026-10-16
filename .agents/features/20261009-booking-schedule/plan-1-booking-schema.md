---
artifact: plan
schema: 1
feature: 20261009-booking-schedule
revision: 1
status: plan-approved
risk: high-risk
---

# Plan 1: Booking schema

- Feature: `.agents/features/20261009-booking-schedule/spec.md`
- Design: `.agents/features/20261009-booking-schedule/design.md`
- Implements decisions: D2, D3, D4, D5 (constraint part), D11 (append-only), D12 (immutability)
- Spec revision: 4
- Depends on: none
- Status: plan-approved
- Estimate: about 180 lines of diff

## Goal

`database/schema.sql` creates the five booking tables with constraints that make double-booking, invalid statuses, history edits and snapshot edits impossible at the database level. The schema test proves it repeatably in PGlite.

## Evidence (checked in the repository)

- `database/schema.sql:1-6`: one idempotent transaction under advisory lock `74832019`, which never drops tables and revokes access from `anon`/`authenticated`.
- `database/schema.sql:63-70`: blanket `REVOKE` plus default privileges, then `schema_versions` inserts 1–4. New tables must sit before the `REVOKE`.
- `tests/postgres-schema.cjs:6-26`: applies the schema twice in PGlite, asserts version count 4, and checks role denial.
- `node_modules/@electric-sql/pglite/dist/contrib/btree_gist.cjs`: the extension is available for tests.
- `scripts/database-init.cjs:12-16`: runs the whole file on one reserved connection.

## Phases

### Phase 1: Tables

- Add `CREATE EXTENSION IF NOT EXISTS btree_gist;`.
- Add the five tables exactly as in design.md "Contracts", plus a nullable `feedback jsonb` column on `bookings` (kept for the existing feedback action until the feedback module). Use `CREATE TABLE IF NOT EXISTS`, then `ENABLE ROW LEVEL SECURITY`.
- Indexes:
  - `bookings(provider_email)`, `bookings(client_email)`, `bookings(status)`.
  - Partial unique indexes for one pending reschedule and one pending cancellation per booking.
- Exclusion constraint `bookings_no_overlap`. Add it inside a `DO` block that checks `pg_constraint` first, so a second run does not fail.

### Phase 2: Guards

- Trigger function `soundstage.history_append_only()` raises on `UPDATE` or `DELETE` of `booking_status_history`.
- Trigger function `soundstage.booking_snapshot_immutable()` raises when `package_name`, `package_inclusions` or `package_price` change.
- Create both triggers with `CREATE OR REPLACE FUNCTION` and `DROP TRIGGER IF EXISTS … ; CREATE TRIGGER` so reruns are idempotent. This drops a trigger, never a table.
- Add `schema_versions` version 5.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T1.1 | none | `database/schema.sql` | AC1 | `tests/postgres-schema.cjs`: all five tables exist after two runs; `SET ROLE anon` and `authenticated` are denied on each |
| T1.2 | T1.1 | `database/schema.sql` | AC2 | insert with status `paid` is rejected by the CHECK |
| T1.3 | T1.1 | `database/schema.sql` | AC3 | two `confirmed` rows for the same provider with overlapping dates → `23P01`; non-overlapping, different provider, or one `pending` → allowed |
| T1.4 | T1.1 | `database/schema.sql` | AC15 | `UPDATE`/`DELETE` on a history row is rejected |
| T1.5 | T1.1 | `database/schema.sql` | AC8 (plan 2 T2.3 adds behavior evidence) | updating `package_price` is rejected; updating `status` is allowed |
| T1.6 | T1.1 | `tests/postgres-schema.cjs` | none | version count assertion changes 4 → 5; PGlite created with `extensions: { btree_gist }` |

## Tests

- All of the above go in `tests/postgres-schema.cjs` (new `test()` block "booking schema").

## Out of scope

- From the spec:
  - UI pages (client and provider modules).
  - Refund decision UI (payroll-master).
  - Refund policy.
  - Moving packages or accounts to tables.
  - Dropping JSON booking records.
- Deferred: domain functions (plan 2), requests (plan 3), rewiring (plan 4), migration (plan 5), and payment tables (payments plan 1).

## Acceptance

- Spec: AC1, AC2, AC3, AC8, AC15.
- Technical:
  - Additive only, rerunnable, and existing tests still pass.
  - Rollback: the new tables are unused until plan 4, so leaving them in place is harmless.

## Verification

- Routine local checks: `npm test`, `npm run typecheck`.
- Scoped operations: `npm run db:init` against any real database is **not** authorized by this plan. The user runs it at deployment (design U1).
- Manual: none.

## Expert skills to apply

- none (no matching skills in `.agents/skills/INDEX.md`)

## Risks and stop points

- Supabase may need `btree_gist` enabled by the project owner. If `CREATE EXTENSION` fails for permissions, record it as a deployment prerequisite. Do not replace the constraint with an application-only check.
- PGlite may reject the `DO`-block constraint guard → stop and report the error.
