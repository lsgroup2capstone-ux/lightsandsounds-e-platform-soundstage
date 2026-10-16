---
artifact: plan
schema: 1
feature: 20261009-booking-schedule
revision: 1
status: plan-approved
risk: high-risk
---

# Plan 5: Migrate JSON bookings, schedules and payments

- Feature: `.agents/features/20261009-booking-schedule/spec.md`
- Design: `.agents/features/20261009-booking-schedule/design.md` (mapping U2)
- Implements decisions: D1 (migration)
- Spec revision: 4
- Also covers: paymongo-payments spec revision 3, AC20
- Depends on: plan 4, paymongo-payments plan 1
- Status: plan-approved
- Estimate: about 300 lines of diff

## Goal

`npm run bookings:migrate` copies legacy bookings, blocked dates and PayMongo records into the tables. It runs as a dry run by default and `--execute` writes. It is idempotent and reports every count. It never changes the JSON records. `--export` writes table bookings back as JSON for an emergency code revert.

## Evidence (checked in the repository)

- `scripts/migrate-identities-to-profiles.cjs` and `package.json` `auth:profiles`: the existing dry-run/`--execute` script pattern to copy.
- `scripts/database-config.cjs`: connection config used by every script.
- `lib/server/domain/client-bookings.ts:6`: key prefix `soundstage-client-bookings-v3:`; `lib/mock-data.ts:41-67`: legacy `Booking` shape (`date`, `durationDays`, `paid`, `refund`, `cancelledBy`).
- `lib/server/data-service.ts:87-88`: `soundstage-paymongo:<id>` `PaymentRecord`. Its `id` equals the booking id for booking payments (`data-service.ts:279`).
- `lib/server/data-service.ts:181`: blocked dates under `soundstage-schedule:<email>`.
- `lib/server/data-service.ts:56-61`: provider email from the service key that contains `packageId`.

## Phases

### Phase 1: Script `scripts/migrate-bookings.cjs`

- Load all records in one transaction under advisory lock `74832019`.
- For each booking:
  - resolve `client_email` from the key and `provider_email` from the service owner;
  - map the status using design U2;
  - `legacy_id = booking.id`;
  - set `start_date`/`end_date` from `date` + `durationDays`;
  - build the snapshot from the stored `packageName`/`basePrice`/`total` (the booking's own copy, not today's package).
- Unmappable (unknown status, missing provider/dates, or `Confirmed` unpaid) → add to `unmappable` with a reason and skip (AC5).
- Insert with `ON CONFLICT (legacy_id) DO NOTHING` and add one history row (`old_status` null, actor `system`, reason "migrated from JSON"). An existing `legacy_id` counts as `skipped` (AC4).
- An exclusion violation (`23P01`) on insert runs inside a `SAVEPOINT`. Roll back that one row, record `{legacy_id, conflictsWith}` in `conflicts`, and continue (AC6).
- PayMongo records → `payments`:
  - `paid` → `paid`, `cancelled` → `expired`, otherwise `pending`→`expired`, since old open sessions cannot be completed under the new flow.
  - `target_id` = migrated booking id, or the subscription email.
  - `legacy_id` set; idempotent (payments AC20).
- Blocked dates → `availability_schedules` (`kind='blocked'`), using `ON CONFLICT DO NOTHING`.
- Print `{bookings:{migrated,skipped,conflicts,unmappable}, payments:{…}, blockedDates:{…}}`. The dry run prints the same counts and rolls back.
- `--export <file>`: writes table bookings to a local JSON file in legacy shape. It is read-only against the database.

### Phase 2: Wiring

- `package.json`: `"bookings:migrate": "node scripts/migrate-bookings.cjs"`.
- `database/README.md`: run order. `db:init`, then dry run, then `--execute` locally. Any other environment needs explicit user approval.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T5.1 | plan 4, payments plan 1 | `scripts/migrate-bookings.cjs` | AC4 | `tests/migrate-bookings.cjs` (PGlite): seeded JSON → counts match; second run migrated 0, skipped N; JSON records byte-identical before and after |
| T5.2 | T5.1 | same | AC5 | unknown status, missing provider, unpaid `Confirmed` → listed in `unmappable`, not inserted, other rows still migrate |
| T5.3 | T5.1 | same | AC6 | two paid `Confirmed` overlapping for one provider → one migrated, other listed in `conflicts` with both ids |
| T5.4 | T5.1 | same (payments) | payments AC20 | PayMongo records migrated with mapped status; rerun skips; legacy paid `Pending` booking + migrated payment → provider accept goes straight to `confirmed` |
| T5.5 | T5.1 | `--export` | none (rollback NFR) | export of migrated rows round-trips to the legacy `Booking` shape |

## Tests

- New `tests/migrate-bookings.cjs` added to `npm test`.

## Out of scope

- From the spec:
  - UI pages.
  - Refund decision UI.
  - Refund policy.
  - Moving packages or accounts to tables.
  - Dropping JSON records (follow-up after production verification).
- Not in this plan: running the migration on any non-local database.

## Acceptance

- Spec: AC4, AC5, AC6; payments AC20.
- Technical: dry run by default; JSON is never modified; the export gives forward recovery.

## Verification

- Routine local checks: `npm test`, `npm run typecheck`.
- Scoped operations:
  - `npm run bookings:migrate` and `-- --execute`. The target is whatever `SUPABASE_DB_URL` points to.
  - **Authorization:** dry run on local only during implementation. `--execute` on any shared or production database only on the user's explicit request.
- Manual: the user reviews the dry-run counts and the `unmappable`/`conflicts` lists before `--execute`.

## Expert skills to apply

- none

## Risks and stop points

- `SUPABASE_DB_URL` points at a non-local database during implementation → do not run the script; use PGlite tests only.
- More than a handful of unmappable or conflicting bookings in a real dry run → stop and show the user before `--execute`.
