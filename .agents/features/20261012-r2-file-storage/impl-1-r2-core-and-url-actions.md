# Implementation 1: R2 client, key rules and upload/read URL actions

- Plan: `.agents/features/20261012-r2-file-storage/plan-1-r2-core-and-url-actions.md`
- Spec revision: 1 (+ design P1/P2)
- Date: 2026-10-12
- Status: ready-for-review

## Files

- `package.json`, `package-lock.json`: `aws4fetch` 1.0.20 (exact). Added `tests/r2-files.cjs` to `npm test`. `pnpm-lock.yaml` was not updated; installed with npm.
- `lib/server/file-keys.ts` (new): `KIND_RULES`, `isFileKind`, `isDataUrl`, `extFor`, `ownerSegment`, `buildKey`, `isOwnKey`.
- `lib/server/r2.ts` (new, `import "server-only"`): `r2Config`, `publicBaseUrl`, `presignPut`, `presignGet`, `headObject`, `deleteObject`.
- `lib/server/request-error.ts` (new): `RequestError`; re-exported from `data-service.ts`, so `route.ts` files are unchanged.
- `lib/server/runtime.ts`: `pendingDeletes` on the context, plus `queueDelete(key)`.
- `lib/server/data-service.ts`: actions `createUploadUrl` and `getProviderDocumentUrl`. `execute()` now collects `pendingDeletes`, deletes them after `sql.begin` resolves, logs failures as `console.error("R2 delete failed", { key })`, and returns `filesBaseUrl`.
- `.env.example`: five empty R2 vars with a server-only comment.
- `tests/r2-files.cjs` (new).

## Deviations

- `aws4fetch` does not sign `content-type`/`content-length` by default. I passed `allHeaders: true` so they are signed, as the plan requires. No library switch was needed.
- Set `retries: 2` on the `AwsClient`. The default of 10 retries with backoff made one failing delete take about 34 s.
- `getProviderDocumentUrl` returns 409 "This document has not been moved to file storage yet." for a document that still has base64 `data` and no key. The plan did not specify this case.
- Until plan 2 changes `ProviderDocument`, `getProviderDocumentUrl` reads `key` through a local type cast.

## Checks (run in this session)

- `node --test tests/r2-files.cjs`: 7/7 pass.
- `npm test`: 48 tests, 48 pass, 0 fail.
- `npm run typecheck`: exit non-zero with 16 errors, all in the untracked `frontend-copy/` folder (missing `@/lib/contracts`, `@/lib/format`, `@/lib/demo-service`). No errors in files this plan touched. I could not confirm on a clean worktree: `frontend-copy/` is untracked, so a clean checkout would not contain it.
- Lint: not installed (unavailable).

## AC evidence

| AC | Evidence |
| --- | --- |
| AC1 | test "createUploadUrl: role, type…": own-prefix key, `X-Amz-Expires` ≤ 600 |
| AC2 | test "requires a signed-in user": `execute(null, …)` rejects with 401 |
| AC3 | same test: gif, 0 bytes, 5 MB + 1 and unknown kind give 400 with a readable message |
| AC4 | `serviceId` of another provider's service gives 403; a client requesting `provider-document` gives 403 |
| AC6 | owner and admin get a GET URL with `X-Amz-Expires=300` |
| AC7 | other provider and client get 403 |
| AC8 | key test: documents under `private/provider-docs/`, images under `public/…`; strict `isOwnKey` |
| AC11 | delete test: DELETE 500 still returns the result and logs the key; a rolled-back transaction deletes nothing |
| AC14 | source checks: `r2.ts` starts with `import "server-only"`; no `NEXT_PUBLIC_R2` in app/components/lib. The build grep happens in plan 3 |
| AC16 | each missing var gives 503 "File storage is not configured." |

## Manual checks

- Not done: a real PUT against a dev bucket (no bucket credentials in this session).

## Unrelated issues

- `frontend-copy/` typecheck errors (above). Root `tsconfig` includes that folder.
- Both `package-lock.json` and `pnpm-lock.yaml` exist.

## Fix round 1 (2026-10-12)

Scope: review-1 findings F1 and F2 only. F3 (stale `pnpm-lock.yaml`) and F4 (409 for legacy documents) need no code change in this round.

| Finding | Change |
| --- | --- |
| F1 | `lib/server/file-keys.ts` `isOwnKey`: the template now contains `\.`, so the built regex matches a literal dot. `tests/r2-files.cjs` adds `<id>Xpng` and `<id>/png` to the "bad" list. |
| F2 | `lib/server/r2.ts` `presignGet`: sanitizer is now `/["\\r\n]/g` (quote, backslash, CR, LF). Deviation: the review's suggested `/["\r\n]/g` is the existing buggy pattern (literal backslash + `r`), so the corrected class adds the `\r` escape. New test: `getProviderDocumentUrl` keeps `permit report.pdf` intact and turns `a"b\c<CR><LF>d.pdf` into `a_b_c__d.pdf` in the decoded `response-content-disposition`. |

### Checks

| Command | Result |
| --- | --- |
| `npm test` | 49 pass, 0 fail (48 before + 1 new test) |
| `npx tsc --noEmit` | errors only in untracked `frontend-copy/` (pre-existing, unchanged); 0 elsewhere |
| lint | not installed |

Manual check still not done: real presigned PUT/GET against a dev bucket (no credentials).
