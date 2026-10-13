---
artifact: implementation
schema: 1
feature: 20261009-role-based-access
revision: 1
status: ready-for-review
risk: high-risk
---

# Implementation 1: Profiles table, server identity resolution, and role:set

- Plan: `plan-1-profiles-and-identity.md`
- Part: all
- Date: 2026-10-12
- Spec revision: 3

## Summary

The application now has an additive `soundstage.profiles` schema for Clerk identities and all four roles, including `payroll_master`. Clerk API requests resolve through the profile table, reject inactive profiles, prevent privileged self-assignment, and mirror newly created roles to Clerk. Operators can assign any valid role with the transactional `role:set` script.

## Files changed

| File | Change |
| --- | --- |
| `database/schema.sql` | Adds the private, RLS-enabled profiles table, legacy Clerk mapping copy, constraints, and schema version 4. |
| `lib/server/access-rules.ts` | Adds the shared four-role tuple and `Role` type for later plans. |
| `lib/server/profiles.ts` | Adds profile lookup, race-safe creation, legacy role fallback, conflict denial, and best-effort Clerk mirroring. |
| `lib/server/data-service.ts` | Resolves Clerk identities from profiles and rejects suspended/deactivated profiles while preserving Supabase identity behavior. |
| `lib/client-auth.ts` | Widens `AccountRole` with `payroll_master`; preserves the pre-existing R2 edits in this file. |
| `lib/server/domain/client-auth.ts` | Widens the server account role type. |
| `lib/server/domain/client-bookings.ts` | Narrows the existing cancellation actor assignment after the role union widened; runtime behavior is unchanged. |
| `scripts/role-set.cjs` | Adds validated, transactional profile role assignment with Clerk mirror rollback behavior. |
| `package.json` | Adds `role:set` and the three new tests while preserving the pre-existing R2 test entry. |
| `tests/postgres-schema.cjs` | Updates schema version evidence and checks that profiles remain inaccessible to browser roles. |
| `tests/profiles-schema.cjs` | Covers columns, constraints, copy, repeatability, source preservation, and privileges. |
| `tests/profiles.cjs` | Covers first-request roles, privileged-role refusal, legacy fallback, concurrency, inactive denial, mirroring, and email conflicts. |
| `tests/role-set.cjs` | Covers successful assignment, validation/unknown-user no-change behavior, and rollback on Clerk failure. |

## Deviations from the plan

- `ensureProfile` uses `ON CONFLICT DO NOTHING` instead of targeting only `clerk_user_id`. PostgreSQL aborts the transaction on a unique-email violation even when the error is caught in JavaScript, preventing the required re-read and 409 response. The untargeted conflict clause safely handles either unique constraint; the following primary-key lookup distinguishes a concurrent same-user insert from a different-user email conflict. The focused test first failed with the targeted form and passed after this correction.
- The user explicitly told the implementer to continue after being warned that `lib/client-auth.ts`, `package.json`, and `tasks.md` contained approved but uncommitted R2 work. Changes in those files were limited to plan-1 lines and preserve the existing work.

## Checks (actually run)

| Command | Result |
| --- | --- |
| `powershell -ExecutionPolicy Bypass -File scripts/sdd-doctor.ps1` | fail: 211 repository-wide pre-existing failures and 1 warning (template `project.md`, unplanned specs, missing skill mirrors, git baseline warning); no role-based-access plan contradiction reported. |
| `npm run typecheck` (first run) | fail: widening `AccountRole` required narrowing the existing booking cancellation assignment. |
| `npm run typecheck` (after fix, repeated after profile fix) | pass, exit 0. |
| `node --test tests/profiles-schema.cjs tests/profiles.cjs tests/role-set.cjs` (first run) | fail: 6 pass, 1 fail; caught email-unique violation left the transaction aborted. |
| `node --test tests/profiles-schema.cjs tests/profiles.cjs tests/role-set.cjs` (after conflict-safe insert) | pass: 7 tests, 7 pass, 0 fail. |
| `npm test` | pass: 64 tests, 64 pass, 0 fail. |
| `npm run db:init` (configured Supabase project, explicitly requested by the user) | pass: additive schema applied successfully; existing-object notices only. |
| privileged-account verification (temporary script, removed) | pass: schema version 4 present; profiles RLS enabled; `anon`/`authenticated` lack `SELECT`; Clerk metadata, active profiles, and application records agree for payroll/admin. |
| `git diff --check` | pass, exit 0; only existing Windows LF-to-CRLF warnings. |
| scoped secret regex scan | pass: no matching Clerk keys, database credentials, or connection URLs. |
| lint | not run: ESLint is not installed (`node_modules/.bin/eslint.cmd` absent), matching the plan baseline. |

Pre-existing failures confirmed before implementation: the SDD doctor failures listed above. The worktree already contained the R2 plan-3 implementation and review changes; they were preserved.

## Acceptance evidence

- AC1-AC3: `tests/profiles-schema.cjs` verifies all D12 columns, role/status/email/ID constraints, legacy copy, idempotence, source preservation, and denial for `anon`/`authenticated`.
- AC4-AC6: `tests/profiles.cjs` verifies client/provider lazy creation, Clerk mirror calls, privileged signup fallback to client, concurrency leaving one row, legacy mapping precedence, and email-conflict denial.
- AC7-AC8: `tests/role-set.cjs` verifies old/new role reporting, Clerk mirroring, input validation, unknown-email behavior, and transactional rollback when Clerk fails.
- AC22: the full 64-test suite passes, including existing Supabase authentication and server workflow tests.

## Manual checks

- Done: at the user's explicit request after implementation, applied schema version 4 to the configured Supabase project; created `payroll+clerk_test@example.com` and `admin+clerk_test@example.com`; assigned roles through `setRole`; verified Clerk public metadata, verified email/password presence, active profile roles, application account records, RLS, and database privileges. Credentials were not written to repository artifacts.
- Not done: browser sign-in and dashboard navigation. Plans 2-3 still own the protected routes and `/payroll-master` page.

## Notes for the reviewer

- Plan 1 adds the role/profile foundation only. Route helpers, proxy enforcement, layouts, `/payroll-master`, and redirect behavior remain plans 2-3; Supabase-to-Clerk migration and removal of the legacy admin-email rejection remain plan 4.
- The plan originally gated hosted schema and role writes until after review. The user explicitly requested these scoped writes before review on 2026-10-12; they were performed against the configured Clerk test instance and Supabase project and verified independently.
- The existing full workflow test logs `role-mirror-failed user_google_provider` because it intentionally uses no Clerk test double for that legacy path. The mirror failure is best-effort by design and the suite still passes.
- Expert skills applied: `supabase` (private schema, RLS/privilege validation, current changelog/docs) and `supabase-postgres-best-practices` (types, constraints, unique indexes, idempotent copy, and privilege checks).

## Outcome metrics

- Lead time: not measured
- Spec changes after implementation began: 0
- Review rounds: 0
- Automated acceptance coverage: AC1-AC8 and AC22 covered by executed tests
- Escaped defects: unknown

## Fix round 1 (review round 1)

- F1: Refactored only the plan-1 identity branch in `lib/server/data-service.ts`; its real diff is now 21 insertions and 22 deletions, and the file is 454 lines versus the 455-line baseline. Runtime behavior is unchanged.
- F2: `tests/profiles-schema.cjs` now snapshots every column of sentinel rows in both `soundstage.clerk_identities` and `soundstage.identities`, reruns the complete schema, and compares both source rows afterward.
- `node --test tests/profiles-schema.cjs tests/profiles.cjs tests/role-set.cjs`: pass, 7/7.
- `npm.cmd run typecheck`: pass, exit 0.
- `npm.cmd test`: pass, 85/85.
- Status: ready for independent review round 2.
