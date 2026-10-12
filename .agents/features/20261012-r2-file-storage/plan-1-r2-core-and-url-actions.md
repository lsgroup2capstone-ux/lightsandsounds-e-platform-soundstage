---
artifact: plan
schema: 1
feature: 20261012-r2-file-storage
revision: 1
status: plan-approved
risk: high-risk
---

# Plan 1: R2 client, key rules and upload/read URL actions

- Feature: `.agents/features/20261012-r2-file-storage/spec.md`
- Design: `.agents/features/20261012-r2-file-storage/design.md`
- Implements decisions: D2, D3, D5, D7 (config only), D9
- Spec revision: 1 (+ design P1/P2)
- Depends on: nothing in this feature. Edits `lib/server/data-service.ts`. Implement after role-based-access plan 1 is shipped, or rebase onto it (see Risks)
- Status: plan-approved
- Estimate: about 320 lines of diff; split point: Phase 3 (tests) becomes its own part if Phases 1–2 exceed 250 lines

## Goal

A server-only R2 module can presign PUT/GET and send signed HEAD/DELETE
requests. A pure key module builds and checks owner-scoped keys. Two new
actions let a signed-in user get a presigned upload URL, and let a provider or
admin get a short-lived document URL. Deletes queued during a request run
after commit, and failures are logged. Nothing in the UI changes yet.

## Evidence (checked in the repository)

- `package.json`: no S3/R2 SDK. Tests run as a fixed list in the `test` script, so new test files must be added there.
- `lib/server/data-service.ts:19`: `RequestError(message, status)`.
- `lib/server/data-service.ts:28-32`: `requireRole` reads the current account from `auth.getAccount()`.
- `lib/server/data-service.ts:139`: `actions` allowlist, the only browser write surface.
- `lib/server/data-service.ts:327-388`: `execute()` runs actions in `sql.begin` under an advisory lock and returns `{ records, session, result }`.
- `lib/server/data-service.ts:22,24,64`: `servicePrefix`/`keyFor` and the cross-provider service-id scan in `serviceInput`. Reuse that scan for the `serviceId` ownership check.
- `lib/server/runtime.ts`: AsyncLocalStorage `context` holding `storage`/`session`. `pendingDeletes` goes here.
- `app/api/data/route.ts:18,20-22`: the response body is `execute()`'s return value. `RequestError` keeps its status. Other errors without a `code` become 400.
- `tests/ts-loader.cjs`: loader with module overrides and a `server-only` stub.
- `.env.example:25-37`: env documentation style.

## Phases

### Phase 1: Modules

- Add dependency `aws4fetch` at an exact version (needs user approval, see design).
- New `lib/server/file-keys.ts` per the design contract: `KIND_RULES`, `ownerSegment`, `buildKey`, `isOwnKey`, `isDataUrl`, `extFor(type)`.
- New `lib/server/request-error.ts` holding `RequestError`. `data-service.ts` re-exports it, so `route.ts` is unchanged.
- New `lib/server/r2.ts` (`import "server-only"`) with these exports:
  - `r2Config()`: throws `RequestError("File storage is not configured.", 503)` if any of the five vars is missing.
  - `presignPut(key, type, size, 600)`
  - `presignGet(key, 300, downloadName?)`
  - `headObject(key) -> { size, type } | null`
  - `deleteObject(key)`
  - `publicBaseUrl() -> string | null`: never throws.
- `lib/server/runtime.ts`: optional `pendingDeletes: string[]` in context state and a `queueDelete(key)` helper.

### Phase 2: Actions and after-commit deletes

- `actions.createUploadUrl(kind, meta)`:
  - Unknown `kind` returns 400.
  - `requireRole` per kind returns 403.
  - `type` must be in the kind's list, and the size must satisfy `Number.isInteger(size) && 0 < size <= 5 * 1024 * 1024`. Otherwise return 400 with "Use a PDF, JPG or PNG up to 5 MB." (documents) or "Use a JPG, PNG or WebP image up to 5 MB." (images).
  - For `service-image` with `serviceId`, return 403 if another provider's service key holds that id.
  - On success, build the key with `randomUUID`, presign it, and return the contract shape.
- `actions.getProviderDocumentUrl(email, index)`:
  - Return 403 unless the actor is the provider with that email or an admin. Check this before reading any document.
  - Return 404 if no document exists at that index.
  - Require `isOwnKey("provider-document", email, doc.key)`, then return `presignGet(key, 300, doc.name)`.
- `execute()`:
  - Create `pendingDeletes` in the context state.
  - After `sql.begin` resolves, run `Promise.allSettled(deleteObject)` over the queued keys. Log each failure with `console.error("R2 delete failed", { key })`.
  - Add `filesBaseUrl: publicBaseUrl()` to the returned object.
- `.env.example`: add the five vars, empty, with a comment that they are server-only and must never get a `NEXT_PUBLIC_` prefix.

### Phase 3: Tests

- `tests/r2-files.cjs`, added to `npm test`. It loads modules through `tests/ts-loader.cjs`, with stubs for `fetch`, env, database and auth (same override style as existing tests).

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T1.1 | none | `lib/server/file-keys.ts` | AC8 | `tests/r2-files.cjs`: each kind's prefix; documents only under `private/`; `isOwnKey` rejects another owner, another kind, `..`, extra segments, uppercase, data URLs |
| T1.2 | T1.1 | `lib/server/r2.ts`, `request-error.ts`, `package.json` | AC14, AC16 | tests: each missing var gives 503 and the message; presigned PUT has `X-Amz-Expires` ≤ 600 and signs `content-length;content-type`; source check that `r2.ts` starts with `import "server-only"` and no file contains `NEXT_PUBLIC_R2`; build grep (plan 3 verification) |
| T1.3 | T1.2 | `createUploadUrl` | AC1, AC2, AC3, AC4 | tests through `execute()`: valid request returns own-prefix key + URL; no user gives 401; bad type or size gives 400; foreign `serviceId` gives 403; a client asking for `provider-document` gives 403 |
| T1.4 | T1.2 | `getProviderDocumentUrl` | AC6, AC7 | tests: owner and admin get a GET URL with `X-Amz-Expires=300`; another provider and a client get 403 |
| T1.5 | T1.2 | `runtime.ts`, `execute()` | AC11 | tests: stubbed DELETE returning 500 still returns the action result, and `console.error` receives the key; queued deletes do not run when the transaction throws |
| T1.6 | none | `.env.example` | none (supports AC14, AC16) | review |

## Tests

- Key rules, presign shape, env failure, action authorization and after-commit deletes → `tests/r2-files.cjs`.
- The existing suite still passes → `npm test`.

## Out of scope

- Custom domain for public files (D7, postponed).
- Including R2 files in app backups (D8).
- Image resizing, thumbnails, virus scanning.
- Keeping base64 files untouched or wiping them (D4 alternatives rejected).
- A new in-app delete-account feature (P2).
- Deferred to later plans: save-path validation and replacement deletes (plan 2), UI (plan 3), and migration, cleanup script and docs (plan 4).

## Acceptance

- Spec: AC1, AC2, AC3, AC4, AC6, AC7, AC8, AC11, AC14, AC16.
- Technical: no data-shape change and no migration; each new file under 300 lines.

## Verification

- Routine local checks: `npm run typecheck` and `npm test`. Baseline in tasks.md: both pass. Lint is not installed, so record it as unavailable.
- Scoped operations: none. Tests stub `fetch`, so no real R2 calls are made.
- Manual (optional, dev bucket only): with real vars in `.env.local`, call `createUploadUrl` from the browser console, then `curl -X PUT` a file with the returned headers.

## Expert skills to apply

- none matched. Only `supabase*` expert skills exist, and this plan does not change Supabase behavior.

## Risks and stop points

- Role-based-access plans 1 and 4 edit `execute()` (`data-service.ts:327-366`). This plan only adds code after `sql.begin` and in the return value. If that file has uncommitted changes you did not make, **stop and report**.
- If `aws4fetch` cannot sign `content-length` into a presigned PUT, **stop and ask** before switching to the AWS SDK.
- If moving `RequestError` breaks `instanceof` in `route.ts`, keep a single class definition and import it from one place everywhere.
