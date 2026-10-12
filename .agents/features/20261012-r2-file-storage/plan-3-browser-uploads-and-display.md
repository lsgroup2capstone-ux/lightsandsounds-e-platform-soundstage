---
artifact: plan
schema: 1
feature: 20261012-r2-file-storage
revision: 1
status: plan-approved
risk: high-risk
---

# Plan 3: Browser uploads, document viewing and image display

- Feature: `.agents/features/20261012-r2-file-storage/spec.md`
- Design: `.agents/features/20261012-r2-file-storage/design.md`
- Implements decisions: D1, D2, D3, D5, D7, P1
- Spec revision: 1 (+ design P1/P2)
- Depends on: plan 2
- Status: plan-approved
- Estimate: about 360 lines of diff; split point: Part A = `lib/file-upload.ts`, `lib/app-store.ts` and the image fields (Phases 1–2); Part B = documents and signup (Phase 3)

## Goal

All four upload inputs send files straight to R2 through presigned URLs and
save only keys. A failed upload shows an error and saves nothing. Images
render from `filesBaseUrl + "/" + key`. Providers upload documents on
`/provider/application` after signing in. The signup form no longer takes
documents. Admins and the owning provider open documents through
short-lived signed URLs.

## Evidence (checked in the repository)

- `lib/app-store.ts:16-27`: `request()` calls `/api/data` and returns the payload. `apply(payload)` stores records and session; `filesBaseUrl` must be captured here.
- `lib/app-store.ts:46`: `mutate(action, args)`.
- `components/dashboard/client-dashboard.tsx:110-119`: profile picture, 2 MB, `readAsDataURL`.
- `components/hubs/hub-workspace.tsx:145-154`: provider logo, 2 MB, `readAsDataURL`.
- `components/hubs/hub-workspace.tsx:177-186`: service image, 3 MB, `readAsDataURL`.
- `components/hubs/provider-applications.tsx:9-10`: `Documents` renders `href={doc.data}` and `<img src={doc.data}>`.
- `components/hubs/provider-applications.tsx:4,21`: imports `readProviderDocuments` and `submitProviderApplication` for resubmission.
- `components/auth/signup-form.tsx:64-65`: reads `credentials` files and passes `application.documents` to `savePendingAccount`.
- `lib/client-auth.ts:7-31`: `savePendingAccount` stores `soundstage-pending-documents` in sessionStorage and submits it after sign-in.
- `lib/client-auth.ts:203-207`: `readProviderDocuments` (1 MB total, `FileReader`).
- Image render sites: `components/booking/booking-flow.tsx`, `components/browse/services-browser.tsx`, `components/dashboard/client-dashboard.tsx`, `components/hubs/admin-accounts.tsx`, `components/hubs/hub-workspace.tsx`, `components/site/package-card.tsx`, `components/site/provider-service-detail.tsx`, `app/services/[id]/page.tsx` (from grep for `profileImage`/`.image`).

## Phases

### Phase 1: Upload helper and base URL (Part A)

- `lib/app-store.ts`: in `apply`, keep `payload.filesBaseUrl` in a module variable and export `getFilesBaseUrl()`.
- New `lib/file-upload.ts`, browser only:
  - `uploadFile(kind, file, serviceId?) -> Promise<string>`. It checks type and size first (same D5 messages as the server), calls `mutate("createUploadUrl", …)`, then `fetch(url, { method: "PUT", headers, body: file })`. On a non-2xx response or a network error it throws `Error("Upload failed. Please try again.")` and returns no key.
  - `publicFileUrl(value)`. A `data:` value is returned unchanged until migration. A key under `public/` returns `base + "/" + key`. Anything else returns `""`.

### Phase 2: Image fields (Part A)

- In the profile picture, logo and service image handlers, replace `FileReader` with `await uploadFile(...)`. Save the key through the existing save call. Show errors through the existing message or `role="status"` element. Limits become 5 MB, and `accept` becomes `image/jpeg,image/png,image/webp`.
- At every image render site, wrap the value with `publicFileUrl(...)`. Keep existing `alt` text and fallbacks.

### Phase 3: Documents and signup (Part B)

- `signup-form.tsx`: remove the `credentials` input and the `readProviderDocuments` call (P1). Provider signup still routes to `/provider/application`.
- `lib/client-auth.ts`: remove the `soundstage-pending-documents` writes and reads and `readProviderDocuments`. Add `uploadProviderDocuments(files: File[]) -> ProviderDocument[]`: 1–4 files, each uploaded with `uploadFile("provider-document", …)`, returning `{ name, type, key, size }`. If any upload fails, nothing is submitted.
- `provider-applications.tsx`:
  - When the provider has no application, or it was rejected, show a labelled file input (`accept=".pdf,image/jpeg,image/png"`, multiple) and a submit button that calls `uploadProviderDocuments` and then `submitProviderApplication`.
  - `Documents` shows each name with an "Open document" button. The button calls `mutate("getProviderDocumentUrl", [email, index])` and opens the returned URL in a new tab (`noopener`). Remove the inline `<img src={doc.data}>` preview, because signed URLs expire. Show a readable error if the request fails.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T3.1 | plan 2 | `lib/file-upload.ts`, `lib/app-store.ts` | AC12 | `tests/file-upload.cjs` (added to `npm test`): stubbed `fetch` PUT 500 or network error → throws, and no save `mutate` call follows; 200 → returns key |
| T3.2 | T3.1 | client-dashboard, hub-workspace, render sites | none (supports D1, D7) | manual: upload, replace and view each image; GET `/api/data` contains no `data:` in new values |
| T3.3 | T3.1 | signup-form, `lib/client-auth.ts`, provider-applications | none (UI for AC6/AC7, owned by plan 1) | manual: provider signs up without files, uploads on `/provider/application`, admin opens a document; the link stops working after ~5 minutes |
| T3.4 | T3.2 | build output | AC14 evidence (owned by plan 1 T1.2) | `npm run build`, then a grep of `.next/static` for `R2_SECRET_ACCESS_KEY` and `R2_ACCESS_KEY_ID` returns nothing |

## Tests

- Upload helper failure and success → `tests/file-upload.cjs`.
- Everything else → manual checks below (no React test setup exists in the repo).

## Out of scope

- Custom domain for public files (D7, postponed).
- Including R2 files in app backups (D8).
- Image resizing, thumbnails, virus scanning.
- Keeping base64 files untouched or wiping them (D4 alternatives rejected).
- A new in-app delete-account feature (P2).
- Deferred: migration, cleanup script, bucket setup and backup docs (plan 4).

## Acceptance

- Spec: AC12.
- Technical: the `publicFileUrl` passthrough for `data:` values is temporary and is removed in plan 4 after migration. Files stay under 300 lines.

## Verification

- Routine local checks: `npm run typecheck`, `npm test`, `npm run build`.
- Scoped operations: manual checks need a **dev** R2 bucket configured in `.env.local` with CORS for `http://localhost:3000`. Do not use a production bucket.
- Manual: keyboard-only upload on each input; error text is announced; a failed upload (bucket CORS off) shows an error and the old image stays; a client cannot open a provider document from the browser console (403).

## Expert skills to apply

- none matched.

## Risks and stop points

- If removing documents from signup breaks the Google signup path (`app/auth/clerk/complete/page.tsx` already sends unapproved providers to `/provider/application`), **stop and report**.
- If the diff passes 400 lines, stop after Part A and hand it to review.
