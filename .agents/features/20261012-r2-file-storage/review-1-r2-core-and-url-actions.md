---
artifact: review
schema: 1
feature: 20261012-r2-file-storage
revision: 1
status: pass
risk: high-risk
---

# Review 1: R2 client, key rules and upload/read URL actions

- Plan: `plan-1-r2-core-and-url-actions.md`
- Spec: `spec.md` (rev 1, + design P1/P2)
- Reviewer: Claude Code session started with `/sdd-review` only
- Independent from implementation: yes (this session did not write any of the code)
- Baseline: `6f3dd6e` (HEAD); the work is uncommitted
- Diff scope: working tree. `git diff` of `.env.example`, `lib/server/data-service.ts`, `lib/server/runtime.ts`, `package.json`, `package-lock.json`, plus new files `lib/server/file-keys.ts`, `lib/server/r2.ts`, `lib/server/request-error.ts`, `tests/r2-files.cjs`

## Round 1 (2026-10-12)

- Scope reviewed: all
- Verdict: changes-requested

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | 16 errors, all in the untracked `frontend-copy/`; none in other paths. Pre-existing and not caused by this plan |
| lint | not installed (unavailable) |
| `npm test` | 48 pass, 0 fail |
| build | not run (the plan does not require it; the build grep is in plan 3) |
| ad-hoc `node` reproductions | F1 and F2 below confirmed |

### Acceptance

| Criterion | Met? | Evidence |
| --- | --- | --- |
| AC1 | yes | `data-service.ts` `createUploadUrl`; `r2.ts` `presignPut` caps at 600 s; test asserts own-prefix key |
| AC2 | yes | `execute()` returns 401 for no user before the action runs; tested |
| AC3 | yes | type/size check in `createUploadUrl` uses the D5 messages; tested with gif, 0, 5 MB + 1 and an unknown kind |
| AC4 | yes | foreign `serviceId` scan gives 403; a client asking for `provider-document` gives 403 via `requireRole`; tested |
| AC6 | yes | `getProviderDocumentUrl` uses `presignGet(…, 300)`; tested for owner and admin. F2 corrupts the download name |
| AC7 | yes | 403 for any non-owner before any document is read; tested |
| AC8 | partial | the prefixes are correct, but the `isOwnKey` regex is not strict (F1), and the plan's T1.1 strictness test misses it |
| AC11 | yes | `execute()` uses `allSettled` after commit and logs the key; tested, including a rollback |
| AC14 | yes | `r2.ts` starts with `import "server-only"`; source check for `NEXT_PUBLIC_R2` passes |
| AC16 | yes | `r2Config()` gives 503 "File storage is not configured."; tested for each var |

### Traceability

| Task | Test/evidence | Result |
| --- | --- | --- |
| T1.1 | `tests/r2-files.cjs` key tests | not met (F1) |
| T1.2 | env/presign/source tests | met (but see F2) |
| T1.3 | `createUploadUrl` tests through `execute()` | met |
| T1.4 | owner/admin/other/client tests | met (F2 untested) |
| T1.5 | DELETE 500 and rollback tests | met |
| T1.6 | `.env.example` reviewed | met |

### Findings

| # | Severity | Finding | Where | Required fix |
| --- | --- | --- | --- | --- |
| F1 | major | `isOwnKey` builds its regex from a template literal, where `\.` turns into an unescaped `.`. It therefore accepts any character before the extension, e.g. `public/profile/<owner>/<32 hex>Xjpg` or `…<32 hex>/pdf`. The design requires a strict regex, and plan 2 (AC5) depends on this check. | `lib/server/file-keys.ts` `isOwnKey` | Write `\.` in the template, or build with `String.raw`. Add a test case to the "bad" list in `tests/r2-files.cjs` with a non-dot separator (e.g. `<id>Xpng` and `<id>/png`) that must return false. |
| F2 | major | The `presignGet` sanitizer `/["\r\n]/g` is a regex literal, so `\r` means a backslash plus the letter `r`. Every `r` in the file name is replaced (`"permit report.pdf"` becomes `"pe_mit _epo_t.pdf"`, reproduced), while a CR is **not** stripped. | `lib/server/r2.ts:32` | Use `/["\\r\n]/g` (quote, backslash, CR, LF). Add a test where `getProviderDocumentUrl` returns a URL whose decoded `response-content-disposition` contains the original name `permit report.pdf`, with a quote and CR/LF replaced. |
| F3 | minor | Only `package-lock.json` was updated; `pnpm-lock.yaml` is now stale for `aws4fetch`. | repo root | Report it to the user, or update both lockfiles, according to whichever package manager `project.md` names. Does not block. |
| F4 | minor | `getProviderDocumentUrl` returns 409 for legacy base64 documents, which the plan does not cover (recorded as a deviation). Acceptable until plan 4 migrates the data. | `data-service.ts` `getProviderDocumentUrl` | No change required; plan 3 UI should handle 409. |

### Scope check

- Changes outside the plan: none. `package-lock.json` churn comes from the dependency add. `tsconfig.tsbuildinfo` is modified, and so are untracked `G2-Sound-Stage/`, `frontend-copy/` and `sdd-kit/`; these are not part of this plan and must not be shipped with it.
- New files are each under 300 lines; there is no data-shape change.

### Unverified manual/operational checks

- A real presigned PUT/GET against a dev R2 bucket (including the browser `Content-Length` signing behavior): not done by the implementer or the reviewer, because there are no bucket credentials. Target: dev bucket only.

## Round 2 (2026-10-12)

- Scope reviewed: fix round 1 (F1, F2) plus a scope recheck
- Reviewer: fresh reviewer agent; did not write the code or the fixes
- Verdict: pass

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `npm test` | 49 pass, 0 fail |
| `npx tsc --noEmit` | 16 errors, all in untracked `frontend-copy/` (same as round 1); 0 elsewhere |
| lint | not installed (unavailable) |

### Findings status

| # | Status | Evidence |
| --- | --- | --- |
| F1 | fixed | `lib/server/file-keys.ts` `isOwnKey` template now has `\.`, so the regex matches a literal dot. `tests/r2-files.cjs:47` adds `Xpng` and `/png` to the bad list; the old pattern accepted `<id>Xpng` (reproduced with node), so the test would fail against the old code. |
| F2 | fixed | `lib/server/r2.ts:32` source bytes are `/["\\r\n]/g` (quote, backslash, CR, LF; checked with `od -c`). New test `getProviderDocumentUrl: download name keeps letters and strips quote, backslash, CR and LF` (`tests/r2-files.cjs:109`) asserts `permit report.pdf` stays intact, which the old `r`-stripping pattern would fail. |
| F3 | open, minor | Unchanged (stale `pnpm-lock.yaml`); does not block. |
| F4 | open, minor | Unchanged; accepted. |

### Scope check

- `git status` matches round 1: no new modified or untracked paths. Fix changes are limited to `file-keys.ts`, `r2.ts` and `tests/r2-files.cjs`.
- `tsconfig.tsbuildinfo`, `G2-Sound-Stage/`, `frontend-copy/` and `sdd-kit/` are still not part of this plan and must not be shipped with it.

### New findings

None.

### Unverified manual/operational checks

- Real presigned PUT/GET against a dev R2 bucket: still not done (no credentials). Target: dev bucket only.
