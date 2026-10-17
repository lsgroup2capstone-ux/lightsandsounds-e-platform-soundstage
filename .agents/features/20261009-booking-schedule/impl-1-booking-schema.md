---
artifact: implementation-report
feature: 20261009-booking-schedule
plan: plan-1-booking-schema.md
status: ready-for-review
---

# Implementation report 1: Booking schema

## Files

- `database/schema.sql`: `btree_gist` extension; five tables (`bookings` with nullable `feedback jsonb`, `booking_status_history`, `availability_schedules`, `reschedule_requests`, `cancellation_requests`), all with RLS; indexes on provider/client email and status; partial unique "one pending" indexes; `bookings_no_overlap` exclusion constraint added in a `pg_constraint`-guarded `DO` block; append-only and snapshot-immutable triggers (drop-trigger/create, never drop table); schema version 5. All inserted before the blanket `REVOKE`.
- `tests/data/postgres-schema.cjs`: new test "booking schema ..." (AC1, AC2, AC3, AC8, AC15, one-pending index); version count 4 → 5.
- `tests/auth/profiles-schema.cjs`: version count 4 → 5.
- `tests/auth/{migrate-identities,profiles,profiles-schema,role-set,signup-sms}.cjs`, `tests/data/{backup,postgres-schema}.cjs`: `new PGlite()` → `new PGlite({ extensions: { btree_gist } })`.

## Deviations

- The plan named only `tests/postgres-schema.cjs` for the PGlite extension and count change. Every test that applies `database/schema.sql` needs the extension, or `CREATE EXTENSION btree_gist` fails, and `profiles-schema.cjs` also asserts the version count. The change is the same mechanical edit; no assertions were weakened.
- Extra columns not listed in design: `id` on `availability_schedules`, `created_at` on the request tables, lowercase-email CHECKs, a weekly/blocked shape CHECK, non-negative `package_price`, and a `booking_status_history(booking_id)` index. FKs from history/request tables to `bookings` use `ON DELETE RESTRICT`.
- The pre-existing uncommitted test-folder restructure (path fix-ups in `tests/**`) was not made by this run. Edits were limited to the lines listed above.

## Checks (run this session)

- Focused: `node --test` on the 7 schema-applying files: 17/17 pass.
- `npm test`: 114/115 pass. The failure is `tests/data/system-activity.cjs`, already recorded as known in `tasks.md` (provider-browse row). Not re-proven on a clean worktree in this run.
- `npm run typecheck`: pass.

## Not done

- `npm run db:init` against a real database: not authorized (design U1). Supabase may require the project owner to enable `btree_gist`; that is a deployment prerequisite.
- `EXPLAIN` on the `isBookable` query (design non-functional note): the query does not exist until plan 2.

## Expert skills

- none (plan lists none).

## Hosted apply (user-authorized 2026-10-17)

- The user asked in-session to apply the schema to their Supabase project. Target: the `SUPABASE_DB_URL` session pooler (`aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`).
- `npm run db:init`: "Supabase PostgreSQL schema applied successfully." `btree_gist` was created without a permission error. The only notices were `DROP TRIGGER IF EXISTS` skips.
- Read-only check afterwards: max schema version is 5. All five tables have RLS on, and `anon` has no SELECT privilege on them. `bookings_no_overlap` and both triggers exist.
- Note: this ran before the independent review. If the review asks for schema changes, they ship as a further additive revision.
