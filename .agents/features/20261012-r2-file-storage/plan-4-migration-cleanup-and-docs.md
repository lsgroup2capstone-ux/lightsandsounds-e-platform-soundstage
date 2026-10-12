---
artifact: plan
schema: 1
feature: 20261012-r2-file-storage
revision: 1
status: plan-approved
risk: high-risk
---

# Plan 4: Base64 migration, account cleanup, bucket and backup docs

- Feature: `.agents/features/20261012-r2-file-storage/spec.md`
- Design: `.agents/features/20261012-r2-file-storage/design.md`
- Implements decisions: D4, D6, D7, D8, P2 (account part)
- Spec revision: 1 (+ design P1/P2)
- Depends on: plan 3
- Status: plan-approved
- Estimate: about 330 lines of diff

## Goal

A one-time, re-runnable script exports every record to a local file, then
uploads every base64 file to R2 and rewrites the records with keys. It prints
migrated, skipped and failed counts. The account cleanup script deletes the
R2 objects of removed accounts. The docs describe the bucket setup and say
that backups do not include R2 files. The temporary `data:` passthrough is
removed.

## Evidence (checked in the repository)

- `scripts/clear-client-provider-data.cjs:1-60`: explicit maintenance script. It is a dry-run inventory by default and runs with `--execute`. It uses `databaseConfig()` and `postgres`, and deletes owned records under `pg_advisory_xact_lock(74832019)` (`:50-52`). It already refuses when Supabase storage objects exist (`:31-32`).
- `scripts/database-config.cjs`: shared DB connection config for scripts.
- `lib/server/data-service.ts:20-22`: record keys `soundstage-accounts-v2`, `soundstage-client-bookings-v3:`, `soundstage-provider-services-v2:`.
- Base64 locations: `accounts[].profileImage`, `accounts[].application.documents[].data`, `services[].image`, `bookings[].image` (copied from the service, `data-service.ts:215`).
- `docs/backup-restore.md:7`: currently says "Embedded documents/images are included."
- `lib/server/backup.ts:22-28`: backups copy `storage.values`. After migration they contain keys only, with no code change (D8).
- `.gitignore`: has no `backups/` entry yet.

## Phases

### Phase 1: Migration script `scripts/r2-migrate.cjs`

- Load env like the other scripts (`@next/env`, `databaseConfig`). Sign requests with `aws4fetch` from plan 1. Exit with a clear message if any R2 var is missing.
- Default mode is a dry run. It reads all `soundstage.records` and writes `backups/r2-premigration-<ISO timestamp>.json`. It then prints the counts it would migrate per location, and writes nothing to R2 or the DB.
- `--execute`: writes the export first, then does the following inside `sql.begin` with `pg_advisory_xact_lock(74832019)`:
  - For each `data:` value, decode it and check that the MIME type is in D5. Unsupported values count as `failed` and are logged with record key, path and reason, and the value is left as is.
  - Otherwise build the key with the content-hash id (design). Send `HEAD`, and `PUT` only if the object is missing. Replace the value.
  - Values that are already keys count as `skipped`.
  - Documents become `{ name, type, key, size }`.
  - Bookings reuse the same hash, so they get the same key as their service.
  - Update only the records that changed.
- Print `{ migrated, skipped, failed }` as JSON. Exit code 1 if `failed > 0`.
- `--restore <file>`: after a typed confirmation argument `--confirm RESTORE`, writes the export back under the same lock. This is the rollback path.
- Add `"r2:migrate": "node scripts/r2-migrate.cjs"` to `package.json` and `backups/` to `.gitignore`.

### Phase 2: Account cleanup and passthrough removal

- `scripts/clear-client-provider-data.cjs`: in the inventory, collect every R2 key from the accounts, services and bookings it will delete, and print the count. With `--execute`, after the DB transaction commits, delete each key and log failures with `{ key }` without stopping. If the R2 vars are missing but keys exist, refuse before deleting anything, as the script already does for storage objects.
- `lib/file-upload.ts`: remove the `data:` passthrough from `publicFileUrl`.

### Phase 3: Docs

- `docs/backup-restore.md`: replace the "Embedded documents/images are included" sentence. The new text: backups contain file keys only; R2 objects are not included and need their own backup strategy (D8).
- New `docs/r2-setup.md`:
  - Create the bucket and an API token scoped to that one bucket.
  - The five env vars (server-only).
  - The r2.dev public URL for `public/` only, plus the stop point from the design.
  - CORS: `PUT`/`GET` from app origins.
  - Run order: dry run, then `--execute` on local, then on any other environment only with explicit approval.
  - The rollback command.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T4.1 | plan 3 | `scripts/r2-migrate.cjs` | AC13 | `tests/r2-migrate.cjs` (added to `npm test`), using PGlite as `tests/backup.cjs` does, with stubbed `fetch`: seeded data URLs in all four locations; first run reports migrated = N; second run migrated 0, skipped N; an unsupported MIME counts as failed with exit 1; export file written before changes |
| T4.2 | T4.1 | script `--restore` | none (rollback, spec NFR) | same test: restore brings back the exact pre-migration values |
| T4.3 | plan 1 | `clear-client-provider-data.cjs` | AC10 | manual dry run on local DB shows the R2 key count; review of the delete-after-commit code. Plan 2 T2.4 test covers service deletion |
| T4.4 | none | `docs/backup-restore.md`, `docs/r2-setup.md` | AC15 | doc review; existing `tests/backup.cjs` passes; manual: a backup after migration contains no `data:` strings |
| T4.5 | T4.1 | `lib/file-upload.ts` | none | `tests/file-upload.cjs` updated: a `data:` value returns `""` |

## Tests

- Migration idempotency, counts, failure exit and restore → `tests/r2-migrate.cjs`.
- Backup still works → `tests/backup.cjs`.

## Out of scope

- Custom domain for public files (D7, postponed).
- Including R2 files in app backups (D8).
- Image resizing, thumbnails, virus scanning.
- Keeping base64 files untouched or wiping them (D4 alternatives rejected).
- A new in-app delete-account feature (P2).

## Acceptance

- Spec: AC10, AC13, AC15.
- Technical: rollback is the local export plus `--restore`, tested in T4.2. R2 objects left after a rollback are harmless orphans.

## Verification

- Routine local checks: `npm run typecheck`, `npm test`.
- Scoped operations:
  - `npm run r2:migrate` (dry run) against the **local** database and a **dev** bucket only. Record the output in `impl-4`.
  - `--execute` on local needs the user's go-ahead in that session.
  - Running against any shared or production database needs separate explicit authorization, and is not part of this plan.
  - `clear-client-provider-data.cjs --execute` is never run by the implementer.
- Manual: record the GET `/api/data` payload size before and after the local migration (performance NFR).

## Expert skills to apply

- supabase-postgres-best-practices: check that the migration's single transaction and per-record updates hold the advisory lock briefly enough and use parameterized queries.

## Risks and stop points

- A large base64 dataset can make one transaction slow. If the dry run counts more than about 500 files, **stop and ask** whether to batch by record key.
- If the dry run finds a document whose MIME type is outside D5, report it before `--execute`. Do not drop the file.
