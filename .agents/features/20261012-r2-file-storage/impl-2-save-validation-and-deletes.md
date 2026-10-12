# Implementation 2: Save-path key validation and replacement deletes

- Plan: `.agents/features/20261012-r2-file-storage/plan-2-save-validation-and-deletes.md`
- Spec revision: 1 (+ design P1/P2)
- Date: 2026-10-12
- Status: ready-for-review

## Files

- `lib/server/domain/client-auth.ts`: `ProviderDocument` is now `{ name, type, key, size }`. `validateProviderDocuments(documents, ownerEmail)` checks 1–4 documents, a name of 1–200 characters, pdf/jpeg/png, an integer size from 1 byte to 5 MB, no `data` field, and `isOwnKey("provider-document", ownerEmail, key)`. Submit and review pass the provider's email. Submit stores only `{ name, type, key, size }`.
- `lib/client-auth.ts`: the browser type matches the server type. The browser `validateProviderDocuments` does the same shape checks, requires a non-empty `key` and does not check ownership. `readProviderDocuments` only had to change so it still compiles (see Deviations).
- `lib/server/data-service.ts`:
  - New `verifiedKey(kind, email, value, previous?)`, which follows the plan exactly.
  - `updateProfile` is now async. It verifies `profileImage` and queues the old image when it was an own key and has changed. The old 1.5M-character limit is gone.
  - `serviceInput(value, previous)` is now async. It verifies `image` against the stored image for the same id.
  - `saveProviderService` and `updateProviderServices` are now async. `updateProviderServices` uses `Promise.all`. For a retained service whose image changed, it rewrites `image` on its bookings and queues the old key. For a dropped service, it queues the service's image key.
  - `submitProviderApplication` is now async. It validates the documents (domain error → 400), sends a `HEAD` for each key, submits, then queues old own document keys that are no longer used.
- `components/hubs/admin-accounts.tsx`, `components/hubs/provider-applications.tsx`: `doc.data` is now read as `(doc as { data?: string }).data`, so legacy documents can still be opened. This is a forced change; plan 3 replaces these render sites.
- Tests:
  - `tests/r2-files.cjs`: 4 new tests.
  - `tests/provider-applications.cjs`: fixture uses the new document shape, plus validator shape and ownership cases. `file-keys.ts` is compiled for target ES2022 here, because the default ES5 target turns `[...new Set()]` into an empty array.
  - `tests/supabase-domain.cjs`: awaits `updateClientAccount` and uses `assert.rejects`, because the action is now async.
  - `tests/clerk-password.cjs`, `tests/postgres-schema.cjs`: their document fixtures now use the key shape. `postgres-schema` sets R2 env vars and stubs `fetch` for the HEAD on that single call, then restores both.

## Deviations

- **Signup and resubmission are broken until plan 3 ships.** To keep `readProviderDocuments` compiling, it now puts the data URL in `key` (`{ name, type, key: dataUrl, size }`). The browser shape check passes, but the server rejects the documents with 400 "Upload the file again." Between plan 2 and plan 3, providers cannot submit documents. Plan 3 removes this function. Do not deploy plan 2 without plan 3.
- **Admin review fails for legacy pending applications.** `reviewProviderApplication` now re-validates with key ownership. A pending application whose documents still hold base64 cannot be approved or rejected until plan 4 migrates it. The plan specifies this behaviour; noting it for the deploy order.
- `submitProviderApplication` validates in the service before the HEAD requests, so a bad shape never reaches R2. The domain validates again on submit.
- Two `as { data?: string }` casts in components, described under Files.

## Checks (run in this session)

- `npm test`: 53 tests, 53 pass, 0 fail (it was 49 before this plan; the 4 new tests are in `r2-files.cjs`).
- `npm run typecheck`: exits non-zero with 16 errors, all in the untracked `frontend-copy/` folder. This matches review 1. No errors elsewhere.
- Lint: not installed.
- Contention under the advisory lock: not measured. Tests stub `fetch`, so no real latency was observed.

## AC evidence

| AC | Evidence |
| --- | --- |
| AC5 | `r2-files.cjs`: for profile, service and application saves, a data URL, a foreign key and a wrong-kind key each give 400 "Upload the file again."; an own key is accepted when the stubbed HEAD returns 200; HEAD 404 (and a wrong content type for a profile image) gives 400 "did not finish". `provider-applications.cjs`: the domain validator rejects a `data` field, a data-URL key, a foreign owner, a bad type, size or name, and 5 documents |
| AC9 | `r2-files.cjs`: replacing a client picture, a provider logo or a service image queues the old key exactly once; an unchanged key queues nothing and sends no HEAD; the booking `image` follows the new key; replacing a legacy data URL queues nothing |
| AC10 (supports) | a dropped service queues its image key |
| Technical | an unchanged legacy data URL sent back as-is is saved without a HEAD |

## Manual checks

- None. The plan lists no manual checks; the UI changes arrive in plan 3.

## Expert skills

- None matched (the plan lists none). No new tagged skill applied.

## Unrelated problems noticed

- `getProviderDocumentUrl` still uses the local type cast from plan 1, which the new `ProviderDocument` type makes unnecessary. I left it because this plan does not touch it.

## Fix round 1 (2026-10-12)

Scope: review-2 F1 only. F2–F4 are minor and optional, so they are not changed.

### Files

- `lib/server/data-service.ts` (`updateProviderServices`): an old service image is queued only if no service in `next` still uses that key. This covers a renamed id that keeps its image and a key shared with another service.
- `tests/r2-files.cjs` (service test), two new cases:
  - renaming `s2` to `s2-new` while keeping `keyB` queues nothing.
  - changing `s1` to `keyC` while `s2` takes `keyA` queues only `keyB` (the dropped image), not `keyA`.

### Deviations

- None. The rename case uses `s2` because `s1` has a booking, and the existing guard ("Deactivate services with existing bookings") blocks removing it.

### Checks (run in this session)

- `npm test`: 53 tests, 53 pass, 0 fail.
- `npm run typecheck`: exits non-zero, but there are 0 errors outside the untracked `frontend-copy/` folder (pre-existing).

### Note for the reviewer

- This session also wrote review-2. Do the re-review in a fresh session.
