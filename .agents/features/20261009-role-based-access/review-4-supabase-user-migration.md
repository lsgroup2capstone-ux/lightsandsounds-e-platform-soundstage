---
artifact: review
schema: 1
feature: 20261009-role-based-access
revision: 1
status: approved
risk: high-risk
---

# Review 4: Supabase user migration

- Plan: `plan-4-supabase-user-migration.md`
- Spec: `spec.md` revision 3
- Reviewer: `/root/review_role_plan4` (fresh reviewer agent)
- Independent from implementation: yes
- Baseline: `a255afd736a05dd0bc3d59cb8e481959ae5b2b95`
- Diff scope: uncommitted plan-4 changes in `scripts/migrate-identities-to-profiles.cjs`, `lib/server/data-service.ts`, `tests/migrate-identities.cjs`, `tests/profiles.cjs`, `tests/postgres-schema.cjs`, `package.json`, `impl-4-supabase-user-migration.md`, and the role-access row of `.agents/state/tasks.md`. Unrelated concurrent changes in `components/auth/login-form.tsx`, `lib/client-auth.ts`, `tests/clerk-password.cjs`, `tsconfig.tsbuildinfo`, `G2-Sound-Stage/`, and `sdd-kit/` were excluded.
- Expert skills: `supabase` (current changelog and database/Auth guidance checked; no relevant breaking change affects the direct Postgres migration) and `supabase-postgres-best-practices` (short transactions, indexed joins, and atomic conflict handling reviewed). Both were discovered by the required folder scan because the generated index is stale.

## Round 1 (2026-10-13)

- Scope reviewed: all of plan 4
- Verdict: changes-requested

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `node --test tests/migrate-identities.cjs tests/profiles.cjs` | pass: 6 tests, 6 pass, 0 fail |
| `node --test tests/postgres-schema.cjs` | pass: 2 tests, 2 pass, 0 fail |
| `npm.cmd run typecheck` | pass, exit 0 |
| `npm.cmd test` | pass: 92 tests, 92 pass, 0 fail |
| `git -c safe.directory=... diff --check -- <tracked plan-4 paths>` | pass, exit 0; line-ending warnings only |
| scoped secret-pattern scan over the plan-4 script, tests, and tracked diff | pass: 0 matches |
| file-size check | pass: application file `lib/server/data-service.ts` is 455 lines, below the 500-line hard limit; all new/reviewed scripts and tests are smaller |
| lint | not run: the approved plan records lint as unavailable |

The first `npm run typecheck` attempt was blocked by the machine's PowerShell execution policy loading `npm.ps1`; the equivalent `npm.cmd run typecheck` command then passed.

### Acceptance

| Criterion | Met? | Evidence |
| --- | --- | --- |
| AC9 | yes for the successful and Clerk-rejection paths; recovery gap remains | `scripts/migrate-identities-to-profiles.cjs:20-83`; `identity migration is dry-run by default, preserves roles, reuses users and is idempotent`; `a Clerk rejection is reported while later identities still migrate`. All three legacy roles are exercised, created users use `skipPasswordRequirement`, the verified existing user is reused and mirrored, names are copied, dry run writes nothing, and a successful rerun skips all profiles. |
| AC10 | yes | `lib/server/data-service.ts:402-426`; `migrated Supabase sessions are denied and former Supabase admins can use Clerk`; the updated full PostgreSQL workflow executes a former Supabase administrator through a Clerk profile and uses Clerk for protected provider/admin actions after profiles exist. |
| Technical: dry-run default | yes | `scripts/migrate-identities-to-profiles.cjs:20,46-49,91`; the focused test proves no Clerk creation and zero profile rows during dry run. |
| Technical: idempotency and bad-run recovery | no | `scripts/migrate-identities-to-profiles.cjs:54-80,96-100` can create a Clerk user before the profile transaction, but a later insert/verification failure records only email, role, and reason. Even successful output omits the `clerkUserId`, contrary to the plan's recovery contract to delete printed Clerk user IDs and profile rows. No test executes this partial-success boundary. |

### Traceability

| Task | Test/evidence | Result |
| --- | --- | --- |
| T4.1 | migration tests cover all roles, create/reuse, verified-primary rejection, names, dry run, successful rerun, and continuation after a Clerk rejection | not met: the required cross-system failure/recovery path is neither retained in output nor tested |
| T4.2 | focused profile test and full PostgreSQL workflow cover the Supabase cutoff and removal of the old Clerk-admin rejection | met |

### Findings

| # | Severity | Finding | Where | Required fix |
| --- | --- | --- | --- | --- |
| F1 | major | The documented bad-run recovery is unavailable at the highest-risk partial-write boundary. Clerk creation/metadata update happens before the profile transaction. If the insert or post-insert conflict check fails, the catch discards the known Clerk user ID, and `main()` prints no ID even for successful migrations. An operator therefore cannot identify a newly created orphan Clerk user using the promised output; a reused user's mirror can also have changed before the database conflict is reported. The happy-path rerun test does not exercise this case. | `scripts/migrate-identities-to-profiles.cjs:39-80,96-100`; `tests/migrate-identities.cjs:34-73`; plan technical acceptance and recovery text | Preserve whether the Clerk user was created or reused and its ID across the database step; expose the ID in successful output and in failures that occur after a Clerk user is known (or safely compensate a newly created user on database failure). Add a deterministic test where Clerk creation succeeds and the profile transaction conflicts/fails, proving the failure continues to later rows, reports a safe recoverable ID/action, leaves source identities unchanged, and has a defined retry or cleanup path. Also assert the source `identities` rows remain unchanged across execute/retry. |

No blocker was found. F1 is major because this is a high-risk migration and the approved plan makes recoverability part of technical acceptance; it prevents a pass even though routine checks succeed.

### Scope check

- The application and script changes stay within the approved plan. The `tests/postgres-schema.cjs` adjustment is a justified consequence of removing the obsolete Clerk-admin rejection and cutting migrated Supabase sessions off.
- No dependency or schema change was added. The migration queries use parameterized tagged templates, both join/filter columns are uniquely indexed by the existing schema, and the transaction is short with no Clerk network call inside it.
- The migration script reads but does not update/delete `soundstage.identities` or `auth.users`. The missing explicit preservation/recovery assertion is included in F1.
- The listed unrelated concurrent work was excluded. No application code, tests, config, spec, plan, or implementation report was changed by this review.

### Unverified manual and operational checks

- Not run: `npm run auth:profiles` dry run or `npm run auth:profiles -- --execute`. Both target the configured hosted Supabase/Clerk environment and the approved plan reserves them for the user at ship time.
- Not run: password reset and browser sign-in for a migrated account, or confirmation that an old Supabase password reaches no protected page.
- Not run: any hosted database/Clerk mutation, deployment, or production/shared data migration.

### Next step

Run `sdd-implement` for plan 4 fix round 1, addressing F1 without changing the approved spec or plan. Then rerun an independent `sdd-review` round.

## Round 2 (2026-10-13)

- Scope reviewed: F1 fix and all plan-4 files (script, `lib/server/data-service.ts`, both tests, `tests/postgres-schema.cjs`, `package.json`)
- Reviewer: fresh reviewer agent; independent from implementation: yes
- Baseline: `a255afd`; diff is uncommitted working tree. `data-service.ts` and `package.json` contain only plan-4 hunks (admin-rejection removal, migrated-profile 403, `auth:profiles` script, `tests/migrate-identities.cjs` appended to `test`). Other working-tree changes excluded and do not touch these files.
- Verdict: pass

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `node --test tests/migrate-identities.cjs tests/profiles.cjs tests/postgres-schema.cjs` | pass: 9 tests, 9 pass, 0 fail |
| `npm.cmd run typecheck` | pass, no errors |
| `npm.cmd test` | pass: 93 tests, 93 pass, 0 fail |
| build | not listed in plan verification; not run |

### F1 verification

- `scripts/migrate-identities-to-profiles.cjs:37-38,60,63,79,81`: `clerkUser` and `action` (`created`/`reused`) are held outside the try; failures after a Clerk user is known carry `clerkUserId` and `action`.
- `scripts/migrate-identities-to-profiles.cjs:97,99`: successful execute output prints the Clerk ID and action; failures print ID and action when known. No secrets printed.
- `tests/migrate-identities.cjs:83-100`: Clerk creation succeeds, profile insert conflicts, failure reports `user_admin`/`created`, later rows still migrate, `identities` rows are unchanged across run and retry, and retry reuses the same Clerk user. F1 is fixed.

### Findings

| # | Severity | Finding | Where | Required fix |
| --- | --- | --- | --- | --- |
| F2 | minor | A reused user's metadata mirror is updated before the profile transaction; on DB failure it stays changed. It is reported (`reused` + ID) and is idempotent on retry, so acceptable. | `scripts/migrate-identities-to-profiles.cjs:62` | None required. |

### Unverified manual and operational checks

- Not run (reserved for the user): `npm run auth:profiles` dry run and `-- --execute` against hosted Supabase/Clerk; migrated-user password reset and sign-in; old Supabase password reaching no protected area.

### Next step

`/sdd-ship` plan 4 (with plan 3 per Risks), after the user's dry run.
