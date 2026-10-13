---
artifact: review
schema: 1
feature: 20261009-role-based-access
revision: 1
status: pass
risk: high-risk
---

# Review 1: Profiles table, server identity resolution, and role:set

- Plan: `plan-1-profiles-and-identity.md`
- Spec: `spec.md` revision 3
- Reviewer: `/root/review_role_plan1` (fresh reviewer agent)
- Independent from implementation: yes
- Baseline: `00f854c49c530b2c14f48ec57a243d63a0c886b0`
- Diff scope: uncommitted plan-1 changes in `database/schema.sql`, `lib/server/access-rules.ts`, `lib/server/profiles.ts`, `lib/server/data-service.ts`, `lib/client-auth.ts`, `lib/server/domain/client-auth.ts`, `lib/server/domain/client-bookings.ts`, `scripts/role-set.cjs`, `package.json`, `tests/postgres-schema.cjs`, `tests/profiles-schema.cjs`, `tests/profiles.cjs`, and `tests/role-set.cjs`; the implementation report was used as a guide, but the working-tree diff was authoritative.
- Expert skills: `supabase` (private-schema/RLS/privilege review and current official guidance), `supabase-postgres-best-practices` (constraints, types, privileges, RLS, upsert, and transaction review).

## Round 1 (2026-10-13)

- Scope reviewed: all of plan 1
- Verdict: changes-requested

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `npm run typecheck` | Did not start: PowerShell blocked `npm.ps1` under the host execution policy. Retried with `npm.cmd`. |
| `npm.cmd run typecheck` | pass, exit 0 |
| `node --test tests/profiles-schema.cjs tests/profiles.cjs tests/role-set.cjs` | pass: 7 tests, 7 pass, 0 fail |
| `npm.cmd test` | pass: 85 tests, 85 pass, 0 fail |
| `git -c safe.directory=... diff --check` | pass, exit 0; line-ending warnings only |
| scoped secret-pattern scan over plan-1 files | pass: 0 matches |
| lint | not run: `node_modules/.bin/eslint.cmd` is absent, matching the plan baseline |
| build | not run: plan 1 requires typecheck and tests, not a build |

The current Supabase changelog and official RLS/Data API guidance were checked read-only. No current breaking change invalidates the private `soundstage` schema, explicit privilege revocation, or RLS approach. No hosted database, Clerk account, migration, role assignment, or other scoped operation was run by this reviewer.

### Acceptance

| Criterion | Met? | Evidence |
| --- | --- | --- |
| AC1 | yes | `database/schema.sql:25`; `profiles schema is constrained, repeatable, copied from Clerk mappings and private` |
| AC2 | no | The migration is additive at `database/schema.sql:37`, and repeatability/copy counts pass, but `tests/profiles-schema.cjs:12-23` never compares either source table's row contents before and after the re-run. This is required high-risk data-integrity evidence. |
| AC3 | yes | `database/schema.sql:36,66-67`; browser-role denial assertions at `tests/profiles-schema.cjs:30-34` and `tests/postgres-schema.cjs:24` |
| AC4 | yes | `lib/server/profiles.ts:54-78`; `first Clerk requests create one client/provider profile and reject privileged signup roles` |
| AC5 | yes | `lib/server/profiles.ts:65-69`; privileged signup-role assertions at `tests/profiles.cjs:44-52` |
| AC6 | yes | conflict-safe insert at `lib/server/profiles.ts:71-76`; concurrent-request assertion at `tests/profiles.cjs:63-67` |
| AC7 | yes | `scripts/role-set.cjs:8-15,29`; `role:set updates the profile and Clerk mirror and returns old/new roles` |
| AC8 | yes | validation and unknown-profile denial at `scripts/role-set.cjs:3-10`; no-change and rollback tests at `tests/role-set.cjs:31-48` |
| AC22 | yes | Clerk resolution is isolated at `lib/server/data-service.ts:403-428`; the complete 85-test suite, including existing Supabase auth and server workflows, passes |

### Traceability

| Task | Test/evidence | Result |
| --- | --- | --- |
| T1.1 | schema inspection; PGlite schema and privilege test | not met: source-preservation evidence is incomplete (F2) |
| T1.2 | profile creation, privileged-role refusal, inactive denial, and full regression suite | met |
| T1.3 | two concurrent `execute()` calls leave one profile and one mirror call | met |
| T1.4 | success, validation, unknown-user no-change, and Clerk-failure rollback tests | met |
| T1.5 | `npm.cmd run typecheck` | met, but the plan's separate no-growth technical condition is not met (F1) |

### Findings

| # | Severity | Finding | Where | Required fix |
| --- | --- | --- | --- | --- |
| F1 | major | Plan 1 explicitly requires `data-service.ts` not to grow, but the real diff has 22 insertions and 19 deletions: 455 baseline lines versus 458 current lines. This technical acceptance condition is not met. | `plan-1-profiles-and-identity.md` Technical acceptance; `lib/server/data-service.ts:18,402-428` | Refactor the plan-1 edit without changing behavior so `lib/server/data-service.ts` has no net line growth from the baseline, then rerun typecheck and the full suite. |
| F2 | major | AC2 says data in both `clerk_identities` and `identities` remains unchanged, and T1.1 explicitly requires that evidence. The test inserts one Clerk source row but only checks its table count; it does not compare its values after rerun and creates no `identities` sentinel row. A regression that mutates source values while preserving count would pass. Because AC2 is high-risk data integrity, code inspection alone cannot close this gap. | `tests/profiles-schema.cjs:12-23` | Add source snapshots/assertions for the complete Clerk row and an `identities` sentinel row before and after the second schema execution. Rerun the focused tests and full suite. |

### Scope check

- Plan-1 changes are identifiable and otherwise match the approved files and behavior. The `lib/server/domain/client-bookings.ts` narrowing is allowed by T1.5's instruction to resolve resulting type errors without behavior changes.
- The working tree also contains approved role-access plans 2-3 and unrelated R2 work, including interleaved edits in `lib/client-auth.ts`, `package.json`, and `lib/server/access-rules.ts`. Those changes were excluded from this plan-1 judgment. The implementation report records the user's explicit authorization to preserve and layer over that dirty worktree.
- No application code, tests, config, spec, plan, or implementation report was changed by this review.

### Unverified manual and operational checks

- Not rerun: `npm run db:init`, `npm run role:set`, or any hosted Supabase/Clerk verification. These are scoped non-local operations and were not authorized for this reviewer.
- Not independently verified: the implementation report's hosted schema-version, RLS, privileged-account, and Clerk metadata claims.
- Not run: browser sign-in for `client1+clerk_test@example.com` and verification of its profile/mirror. The implementation report states browser navigation remains outstanding.

### Next step

Run `sdd-implement` for plan 1 as a focused fix round addressing F1-F2, update `impl-1-profiles-and-identity.md` with the new evidence, and return this plan to an independent `sdd-review` round 2.

## Round 2 (2026-10-13)

- Scope reviewed: F1-F2 fixes and regression impact
- Verdict: pass

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `git diff --numstat -- lib/server/data-service.ts tests/profiles-schema.cjs` plus baseline/current line count | pass: `data-service.ts` is 21 insertions and 22 deletions, 454 current lines versus 455 baseline lines |
| `node --test tests/profiles-schema.cjs tests/profiles.cjs tests/role-set.cjs` | pass: 7 tests, 7 pass, 0 fail |
| `npm.cmd run typecheck` | pass, exit 0 |
| `npm.cmd test` | pass: 85 tests, 85 pass, 0 fail |
| `git -c safe.directory=... diff --check` | pass, exit 0; line-ending warnings only |

### Acceptance and fix verification

| Item | Met? | Evidence |
| --- | --- | --- |
| F1 / technical no-growth condition | yes | The real diff for `lib/server/data-service.ts` is net -1 line. Inspection confirms the refactor preserves the Clerk/Supabase branch behavior at `lib/server/data-service.ts:402-425`; typecheck, focused tests, and the full suite pass. |
| F2 / AC2 source preservation | yes | `tests/profiles-schema.cjs:12-16` creates and snapshots complete sentinel rows for `clerk_identities` and `identities`; `tests/profiles-schema.cjs:17,25-26` reruns the schema and compares every source column. The focused test and full suite pass. |
| T1.1 | yes | PGlite now proves copy, repeatability, complete source-row preservation for both legacy tables, constraints, and browser-role denial. |
| T1.2-T1.5 | yes | No regression in the previously accepted evidence; focused 7/7, full 85/85, and typecheck all pass. |

### Findings

None. Both round-1 major findings are closed, with no new blocker, major, or minor findings in the fix scope.

### Scope check

- The fix is limited to the plan-1 identity branch in `lib/server/data-service.ts`, the source-preservation assertions in `tests/profiles-schema.cjs`, and the implementation report/status evidence owned by the implementer.
- Other role-access plans and unrelated R2 working-tree changes remain excluded from this verdict.
- No application code, tests, config, spec, plan, or implementation report was changed by this review.

### Unverified manual and operational checks

- Not rerun: hosted `db:init`, `role:set`, Clerk metadata, or Supabase privilege checks; these remain scoped non-local operations.
- Not run: browser sign-in/profile-mirror verification. This does not withhold the plan-1 pass because the high-risk AC1-AC8 and AC22 behaviors have executed local evidence, while the hosted claims remain explicitly unverified by the reviewer.

### Next step

Plan 1 is approved. Run `sdd-ship` for plan 1 when the user wants the reviewed slice committed, or continue independent review of plans 2-3 before shipping the combined role-access work.
