---
artifact: plan
schema: 1
feature: 20261018-relational-data
revision: 1
status: superseded
risk: high-risk
---

# Plan 2: Collection tables, table-backed record store, booking JSONB removal

> Superseded on 2026-10-18 by spec revision 2 and plan-4-core-tables.md (the 11 core tables). Kept for history.

- Feature: `.agents/features/20261018-relational-data/spec.md`
- Implements decisions: D1, D2, D3, D4, D5, D6
- Spec revision: 1
- Depends on: plan 1
- Status: plan-approved (user instruction 2026-10-18)
- Estimate: about 450 lines; split point after Phase 2 (schema + copy) if needed

## Goal

Every request reads and writes the eleven collections through typed tables;
`soundstage.records` is no longer touched by the app; `bookings` has no `jsonb`
columns.

## Evidence (checked in the repository)

- `lib/server/data-service.ts:322-381`: `execute` loads all records into `MemoryStorage`, runs the action, upserts changed keys and deletes missing keys.
- `lib/server/runtime.ts:7`: request context holds `storage`, `session`, `tx`.
- Domain modules read/write keys: `lib/server/domain/client-auth.ts` (`soundstage-accounts-v2`), `provider-services.ts` (`soundstage-provider-services-v2:<email>`), `marketplace-billing.ts` (`soundstage-marketplace-v1` = subscriptions, payments, audit), `communications.ts` (messages, reports), `withdrawals.ts`, `data-service.ts:120-124` (notification reads), `components/hubs/provider/provider-content.tsx:42` reads `soundstage-schedule:<email>` (blocked dates now in `availability_schedules`).
- `lib/server/bookings/core.ts:107-111` writes `package_inclusions`; `compat.ts:34,54,105-111` reads/writes `feedback`.
- `lib/server/db/backup.ts`, `legacy-import.ts` operate on `storage.values`.

## Phases

### Phase 1: Tables

- `accounts` (PK role+email), `provider_applications` (PK provider email, FK accounts, cascade), `provider_documents` (position, name, type, key, size), `provider_services` (id PK, provider email, position, typed fields), `subscriptions`, `subscription_payments`, `activity_log` (seq, actor, action, target, before, after, at), `booking_messages`, `provider_reports`, `withdrawal_requests`, `notification_reads`, `booking_inclusions`.
- RLS and the blanket revoke cover them.

### Phase 2: One-time copy (schema v6)

- `DO` block runs only when version 6 is absent: copies each supported key from `soundstage.records` with `jsonb_array_elements`, safe timestamp parsing (`soundstage.try_timestamptz`), lowercasing emails, skipping malformed items; copies `package_inclusions` into `booking_inclusions` and `feedback` into `booking_feedback`; copies JSON-in-history refunds into `refunds` (plan 3 owns the behavior; the copy lives here so it runs in the same transaction).
- Then `ALTER TABLE bookings DROP COLUMN IF EXISTS package_inclusions, feedback` and the snapshot trigger stops referencing inclusions.
- Insert version 6.

### Phase 3: Record store

- New `lib/server/db/record-store.ts`: `loadRecords(tx)` returns the key→JSON map built from tables (schedule key from `availability_schedules` blocked dates); `saveRecords(tx, before, after)` diffs by item id per collection and upserts/deletes rows; unknown keys are refused, transient keys (`soundstage-admin-account`, `soundstage-import-completed`, booking JSON keys) are ignored.
- `data-service.ts` `execute` uses them instead of `soundstage.records`.
- `profiles.ts` reads `accounts`.

### Phase 4: Booking columns

- `core.ts` inserts inclusions into `booking_inclusions`; `compat.ts` reads/writes `booking_feedback`.
- Tests that seeded `soundstage.records` seed tables through `saveRecords` (test helper).

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T2.1 | plan 1 | `database/schema.sql` | AC1 | role denial on each new table |
| T2.2 | T2.1 | `database/schema.sql` | AC4, AC5 | copy test: records → tables once; second run copies nothing; records unchanged; no json columns outside records |
| T2.3 | T2.1 | `lib/server/db/record-store.ts`, `data-service.ts` | AC2, AC3 | workflow test: actions change tables, `soundstage.records` stays empty; visible record shapes unchanged (existing tests) |
| T2.4 | T2.1 | `core.ts`, `compat.ts` | AC6, AC7 | booking test reads `booking_inclusions`; feedback duplicate rejected; update/delete rejected |
| T2.5 | T2.3 | `backup.ts`, `legacy-import.ts` (no change expected), `tests/data/backup.cjs` | AC13 | backup/restore round-trip through tables |

## Out of scope

- Dropping `soundstage.records` (spec D5); screen changes (D2).

## Acceptance

- Spec: AC1-AC7, AC13.
- Rollback: to run the previous code, re-add `bookings.package_inclusions jsonb` / `feedback jsonb` and fill them from `booking_inclusions` / `booking_feedback`; records still hold the pre-v6 JSON for other collections, but changes made after v6 exist only in tables.

## Verification

- Routine: `npm test`, `npm run typecheck`, `npm run build`.
- Scoped: `npm run db:init` on a real database is not authorized here; the user runs it on a local copy first.

## Risks and stop points

- A legacy row violating a new constraint aborts the whole schema transaction (nothing changes) → fix the data or relax the copy filter; never weaken table constraints.
