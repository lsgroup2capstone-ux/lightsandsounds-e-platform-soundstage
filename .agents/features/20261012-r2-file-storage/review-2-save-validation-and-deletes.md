---
artifact: review
schema: 1
feature: 20261012-r2-file-storage
revision: 1
status: pass
risk: high-risk
---

# Review 2: Save-path key validation and replacement deletes

- Plan: `plan-2-save-validation-and-deletes.md`
- Spec: `spec.md` (rev 1, + design P1/P2)
- Reviewer: Claude Code `/sdd-review` session (fresh session)
- Independent from implementation: yes (this session did not implement plan 2)
- Baseline: `ea4e3e7` (HEAD)
- Diff scope: uncommitted working tree: `lib/server/data-service.ts`, `lib/server/domain/client-auth.ts`, `lib/client-auth.ts`, `components/hubs/admin-accounts.tsx`, `components/hubs/provider-applications.tsx`, `tests/{r2-files,provider-applications,supabase-domain,clerk-password,postgres-schema}.cjs`, `tsconfig.tsbuildinfo`, `.agents/state/tasks.md`. The untracked `G2-Sound-Stage/`, `sdd-kit/` and `frontend-copy/` are not part of this plan.

## Round 1 (2026-10-12)

- Scope reviewed: all
- Verdict: changes-requested

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `npm run typecheck` | non-zero; 0 errors outside the untracked `frontend-copy/` (pre-existing, same as review 1) |
| lint | not installed |
| `npm test` | 53 tests, 53 pass, 0 fail |
| build | not run (not in plan verification) |

### Acceptance

| Criterion | Met? | Evidence |
| --- | --- | --- |
| AC5 | yes | `verifiedKey` `lib/server/data-service.ts:64-72`; profile `:86`; service `:78`; application `:216-227` and domain `lib/server/domain/client-auth.ts:25-28`; tests in `tests/r2-files.cjs` (data URL, foreign key, wrong kind → 400; own key + HEAD 200 accepted; HEAD 404 → 400) and `tests/provider-applications.cjs` |
| AC9 | partly | profile `:98`, services `:242-250`, tests in `r2-files.cjs`. See F1: a replaced key can be deleted while another service still uses it |
| AC10 (supports) | partly | dropped service queues image `:249`; same F1 gap |
| Technical: unchanged legacy value saveable | yes | `:67` returns before the data-URL check; covered in `r2-files.cjs` |

AC5 reading (plan stop point): an unchanged stored value sent back is not a newly accepted value, so the legacy exception does not contradict AC5. Not raised as blocked. Deploy order still matters (see F3).

### Traceability

| Task | Test/evidence | Result |
| --- | --- | --- |
| T2.1 | typecheck clean outside `frontend-copy/`; fixture uses `{ name, type, key, size }` | met |
| T2.2 | `r2-files.cjs` save-validation cases | met |
| T2.3 | `r2-files.cjs` replacement and booking cases | met, except F1 |
| T2.4 | `r2-files.cjs` dropped-service case | met, except F1 |

### Findings

| # | Severity | Finding | Where | Required fix |
| --- | --- | --- | --- | --- |
| F1 | major | `updateProviderServices` queues an old service image without checking whether a service in `next` still uses that key. A provider can rename a service id while keeping its image (the new id has no `previous`, so the HEAD passes and the old id is treated as removed), or point service B at A's key and then change A. Either way the object is deleted after commit while a saved service and its bookings still reference it. That is data loss, and D6 only covers objects that are no longer used. | `lib/server/data-service.ts:242-250` | Before queueing, skip `old.image` if any `s.image` in `next` equals it, as the document path does at `:226`. Add an `r2-files.cjs` test: renaming a service id with the same image queues nothing, and a key shared by two services is not queued when only one of them changes. |
| F2 | minor | `submitProviderApplication` sends HEAD requests before the domain's "already submitted" check, so a pending or approved provider causes R2 calls that always end in an error. | `lib/server/data-service.ts:216-224` | Optional: reject early when `actor.application` exists and is not `Rejected`. |
| F3 | minor | Deploy coupling: document submission is broken until plan 3 ships, and admins cannot review legacy pending applications until plan 4 migrates them (impl-2 Deviations). | `lib/client-auth.ts:205`, `lib/server/domain/client-auth.ts:44` | No code change. Do not deploy plan 2 on its own. Ship plans 2–4 together or run the migration first, and note this in plan 4's docs. |
| F4 | minor | The generic loop still slices `profileImage` to 2000 characters before `verifiedKey` overwrites it. This is harmless but redundant. | `lib/server/data-service.ts:85-86` | Optional: drop `"profileImage"` from the loop's key list. |

### Scope check

- Changes outside the plan: the two component casts (`as { data?: string }`) and the test updates in `supabase-domain`, `clerk-password` and `postgres-schema` are type-forced and documented in impl-2. `tsconfig.tsbuildinfo` is a build artifact; leave it out of the ship commit. Nothing else.

### Expert skills

- None matched for this review (index scan: no storage/security-tagged skill applies beyond the base rules).

### Unverified checks

- Advisory-lock latency or contention from HEAD inside the transaction: not measured, since tests stub `fetch`. Target: staging R2 once plan 3 lands.

## Round 2 (2026-10-12)

- Reviewer independence: fresh reviewer agent; did not write the code or the fix round.
- Baseline: HEAD `ea4e3e7`, uncommitted diff (`git diff`, `git status`).
- Verdict: **pass**

### Checks (run in this session)

- `npm test`: 53 tests, 53 pass, 0 fail.
- `npm run typecheck`: non-zero exit; 0 errors outside untracked `frontend-copy/` (pre-existing).

### F1 re-check

- Fixed. `updateProviderServices` now queues `old.image` only when `isOwnKey(...)` and `!next.some(s => s.image === old.image)` (`lib/server/data-service.ts`, the queueDelete line in the `for (const old of current)` loop). Covers both the renamed-id and shared-key cases.
- Tests: `tests/r2-files.cjs:217-220` — rename `s2`→`s2-new` keeping `keyB` queues nothing; `s1`→`keyC` with `s2` taking `keyA` queues only `[keyB]`. Meaningful and passing.
- No other code changes since Round 1 beyond this line and the tests; no regressions found.

### Acceptance update

| Criterion | Met? | Evidence |
| --- | --- | --- |
| AC9 | yes | service delete path guarded against keys still in use; `r2-files.cjs:215-220` |
| AC10 (supports) | yes | dropped-image case `r2-files.cjs:219-220` |

### Findings

- None new. F2–F4 (minor) remain open and do not block. F3 deploy coupling still applies: ship plans 2–4 together or migrate first. Leave `tsconfig.tsbuildinfo` out of the ship commit.

### Unverified checks

- Unchanged from Round 1 (HEAD latency inside the transaction against real R2).
