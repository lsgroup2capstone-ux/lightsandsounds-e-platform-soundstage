# Implementation 3: Browser uploads, document viewing and image display

- Plan: `.agents/features/20261012-r2-file-storage/plan-3-browser-uploads-and-display.md`
- Spec revision: 1 (+ design P1/P2)
- Date: 2026-10-12
- Scope: whole plan (Part A and Part B). The diff is about 175 lines, well under the 400-line split point.
- Status: ready-for-review

## Files

- `lib/app-store.ts`: `apply` keeps `payload.filesBaseUrl` (trailing slashes stripped) in a module variable, exported through `getFilesBaseUrl()`.
- `lib/file-upload.ts` (new):
  - `uploadFile(kind, file, serviceId?)` checks type and size, calls `createUploadUrl`, then sends a `PUT` with the file. A non-2xx response or a network error throws "Upload failed. Please try again.".
  - `publicFileUrl(value)` maps a `public/` key to `base/key`, passes `data:` values through, and returns `""` for anything else.
- `components/dashboard/client-dashboard.tsx`, `components/hubs/hub-workspace.tsx`:
  - The profile picture, logo and setup image handlers use `uploadFile`. The key goes into state and is saved through the existing save call.
  - Errors show in the existing `role="status"` or `role="alert"` element. On failure the previous value stays.
  - The limit is now 5 MB, with `accept="image/jpeg,image/png,image/webp"`.
  - The file input is reset after each pick, so the same file can be chosen again.
- Image render sites now go through `publicFileUrl`: client-dashboard (booking row, profile preview, header avatar), hub-workspace (logo preview, setup preview, provider header logo), `admin-accounts.tsx`, `package-card.tsx` and `provider-service-detail.tsx`. Existing `alt` text and fallbacks are kept, and `/placeholder.svg` is used when a value maps to `""`.
- `components/auth/signup-form.tsx`: the `credentials` input, `DocumentPreview`, `documentFiles` state and `readProviderDocuments` call are removed (P1). The provider note now says documents are uploaded after signing in. Routing is unchanged.
- `lib/client-auth.ts`:
  - Removed: the `soundstage-pending-documents` writes and reads, `readProviderDocuments`, and the document check in `savePendingAccount`.
  - `finishSignup` now only refreshes the store.
  - Added `uploadProviderDocuments(files)`: 1–4 files uploaded in parallel, then `validateProviderDocuments`. If any upload rejects, the promise rejects and the caller never calls `submitProviderApplication`.
- `components/hubs/provider-applications.tsx`:
  - The existing no-application/rejected form now calls `uploadProviderDocuments` and uses `accept=".pdf,image/jpeg,image/png"`. Its hint text says 5 MB each.
  - `Documents` (now exported) shows an "Open document" button for each document, which calls `getProviderDocumentUrl`. The inline `<img>` preview is gone, and errors show in a `role="alert"` paragraph.
- Tests:
  - `tests/file-upload.cjs` (new, added to `npm test`) covers a PUT 500 or network error (throws, and only `createUploadUrl` is called, with no save mutation), a 200 response (returns the key; method, body and headers checked), type and size rejected before any request, and `publicFileUrl` mapping.
  - `tests/clerk-password.cjs`: the signup test used to assert that signup submitted documents. It now asserts the P1 behaviour: no `soundstage-pending-documents` and no `submitProviderApplication` call at signup.
- `package.json`: test script includes `tests/file-upload.cjs`.

## Deviations (for the reviewer to judge)

1. **`publicFileUrl` passes root-relative paths through.** These are paths like `/images/pkg-band.webp` that start with `/` but not `//`. The plan says anything that is not `data:` or `public/` should return `""`, but the mock catalog in `lib/mock-data.ts` stores those static paths. Bookings copy `pkg.image`, so returning `""` would blank every catalog image. Protocol-relative values (`//host`) still return `""`.
2. **`app/services/[id]/page.tsx` is not wrapped.** It is a server component that renders only `lib/mock-data.ts` packages. It has no uploaded images, and on the server `getFilesBaseUrl()` is always `""`.
3. **The browser drops `Content-Length` from the presigned headers.** Browsers forbid setting it and send it from the body, so the signed value still matches. `Content-Type` is sent as signed.
4. **How "Open document" opens the tab.** It opens a blank tab synchronously, sets `tab.opener = null`, then sets the tab's location to the signed URL. The plan's `window.open(url, "_blank", "noopener")` after an `await` is usually blocked as a pop-up, and with `noopener` it returns `null`. If the browser blocks the blank tab, the code falls back to `window.open(url, "_blank", "noopener")`. On error, the blank tab is closed.
5. **`admin-accounts.tsx` document links are also replaced.** That component rendered `doc.data` download links. Impl 2 listed it as a site for plan 3 to replace, but plan 3 did not name it. It now reuses `Documents`, so admins open signed URLs there too.
6. **`hub-workspace.tsx` is 366 lines**, over the 300-line guideline. It was already that size; this plan's net change there is zero lines. Splitting it is out of scope.
7. Image uploads put a key in form state before the user saves. If the user leaves without saving, the object is orphaned in R2. Plan 4's cleanup script is the place for that. No code change.

## Checks (run in this session)

- `npm run typecheck`: exit 0, no errors. The `frontend-copy/` errors noted in review 1 and impl 2 no longer appear.
- `npm test`: 57 tests, 57 pass, 0 fail. Before this plan there were 53: plus 4 in `file-upload.cjs`, and the updated clerk-password test.
- `npm run build`: "Compiled successfully". The build rewrote `next-env.d.ts` (`.next/dev/types` → `.next/types`), and I restored it with `git checkout`.
- T3.4: `grep -rl "R2_SECRET_ACCESS_KEY\|R2_ACCESS_KEY_ID" .next/static` printed nothing and exited 1 (no matches).
- Lint: not installed.

## AC evidence

- AC12 (a failed upload saves nothing): `tests/file-upload.cjs` "a failed PUT throws and no save mutation follows". In the handlers, the key is set in state only after `uploadFile` resolves. `uploadProviderDocuments` rejects before `submitProviderApplication` runs.
- AC14 evidence (owned by plan 1): the grep above found no matches.

## Manual checks

Not done. No dev R2 bucket was configured or used in this session, and I did not run the app in a browser. Still outstanding, per the plan:

- Upload, replace and view each image (profile picture, logo, setup image). Confirm that GET `/api/data` contains no new `data:` values.
- A provider signs up without files, uploads on `/provider/application`, and an admin opens a document (from both the applications hub and admin accounts). The link should stop working after about 5 minutes.
- Google signup still lands unapproved providers on `/provider/application`. That code (`app/auth/clerk/complete/page.tsx`) was not changed and `finishSignup` still runs there.
- Keyboard-only upload on each input, and error text is announced.
- With bucket CORS off, a failed upload shows an error and the old image stays.
- A client calling `getProviderDocumentUrl` from the console gets 403. This is covered server-side by plan 1 tests, but has not been checked in a browser.

## Unrelated issues noticed

- None new.

## Expert skills

- None matched (as the plan states).
