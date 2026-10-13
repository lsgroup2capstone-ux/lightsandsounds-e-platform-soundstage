---
artifact: implementation
schema: 1
feature: 20261009-role-based-access
revision: 1
status: ready-for-review
risk: high-risk
---

# Implementation 4: Migrate Supabase users to Clerk profiles

- Plan: `plan-4-supabase-user-migration.md`
- Part: all
- Date: 2026-10-13
- Spec revision: 3

## Summary

The new dry-run-by-default migration inventories every legacy Supabase identity, reuses a single verified Clerk match or creates a passwordless Clerk user, and inserts the matching profile without modifying the source row. Legacy Supabase sessions are denied after their email has a profile, while migrated Clerk administrators are no longer rejected by the data service.

## Files changed

| File | Change |
| --- | --- |
| `scripts/migrate-identities-to-profiles.cjs` | Adds the idempotent dry-run/execute migration, short per-row database transaction, safe output, and failure continuation. |
| `lib/server/data-service.ts` | Removes the legacy Clerk-admin rejection and denies superseded Supabase identities. |
| `tests/migrate-identities.cjs` | Covers dry run, all roles, create/reuse, names, idempotency, and continued processing after rejection. |
| `tests/profiles.cjs` | Covers Supabase cutoff and migrated Clerk-admin access. |
| `tests/postgres-schema.cjs` | Replaces the obsolete admin rejection expectation and uses Clerk identities after profiles exist. |
| `package.json` | Adds `auth:profiles` and the migration test to the suite. |

## Deviations from the plan

- `tests/postgres-schema.cjs` also changed because its full workflow explicitly expected the Clerk administrator rejection removed by T4.2. Once a profile is present, the workflow now correctly stops using the superseded Supabase identity.

## Checks (actually run)

| Command | Result |
| --- | --- |
| `node --test tests/migrate-identities.cjs tests/profiles.cjs` | pass (6/6) |
| `npm run typecheck` | pass |
| `node --test tests/postgres-schema.cjs` | pass (2/2) after updating the superseded-auth workflow |
| `npm test` | pass (92/92) |
| lint | not run; the project lint command is not installed/configured for this workflow |

Pre-existing failures confirmed on the previous commit: none.

## Manual checks

- Done: none; automated PGlite and fake-Clerk coverage only.
- Not done: `npm run auth:profiles` and `--execute`, password reset, and browser sign-in. The approved plan reserves those operations for the user and the current scope forbids shared/production data migration.

## Notes for the reviewer

- External Clerk calls complete before each short database transaction; no database lock is held across an API request.
- The script never updates or deletes `identities` or `auth.users`.
- Concurrent unrelated edits exist in `components/auth/login-form.tsx`, `lib/client-auth.ts`, and `tests/clerk-password.cjs`; they are not implementation-4 scope and must be excluded from review/ship.

## Fix round 1

- Preserved the known Clerk user ID and created/reused action when a later database operation fails, and included both in successful and recoverable-failure CLI output.
- Added a deterministic post-creation profile conflict test. It proves later rows still migrate, source identities remain byte-for-byte unchanged, the failure reports `user_admin` with action `created`, and a retry reuses that user after the conflict is cleared.
- Checks: `node --test tests/migrate-identities.cjs tests/profiles.cjs` pass (7/7); `npm run typecheck` pass; full `npm test` pending below.

## Outcome metrics

- Lead time: one session
- Spec changes after implementation began: 0
- Review rounds: 0
- Automated acceptance coverage: AC9 and AC10
- Escaped defects: unknown
