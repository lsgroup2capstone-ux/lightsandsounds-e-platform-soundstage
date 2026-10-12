---
artifact: spec
schema: 1
feature: 20261012-r2-file-storage
revision: 1
status: spec-approved
risk: high-risk
---

# R2 file storage

- Feature id: 20261012-r2-file-storage
- Revision: 1
- Status: spec-approved
- Risk lane: high-risk
- Approved by: user, 2026-10-12
- Related decisions: none

## Problem

Every uploaded file is read in the browser with `FileReader.readAsDataURL` and
stored as a base64 string inside account/service data. This bloats every read
and backup, forces tiny size limits (1 MB total for provider documents), and
keeps sensitive identity documents inline with ordinary app data. Files should
live in a Cloudflare R2 bucket, with the database holding only object keys.

Facts found in the code:

- Provider permit/ID documents (1–4 files) are read to data URLs in
  `lib/client-auth.ts:205` and validated server-side in
  `lib/server/domain/client-auth.ts:24-27` (types pdf/jpeg/png, ≤ 1.4M base64
  chars total, must start with `data:<type>;base64,`).
- `ProviderApplication.documents: ProviderDocument[]` holds `{ name, type, data }`
  (`lib/server/domain/client-auth.ts:4`).
- Client profile picture: `components/dashboard/client-dashboard.tsx:110-119`,
  2 MB limit, stored in `profileImage`.
- Provider business logo: `components/hubs/hub-workspace.tsx:145-154`, 2 MB
  limit, stored in `profileImage`.
- Service setup image: `components/hubs/hub-workspace.tsx:177-186`, 3 MB limit,
  stored in `ProviderService.image` (`lib/server/domain/provider-services.ts:13`).
- Admin views documents in `components/hubs/provider-applications.tsx`.
- Backups serialize app data and reject payloads over ~11 MB
  (`lib/server/backup.ts:28`).
- No S3/R2 SDK is installed (`package.json`).

## Decisions

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | Which uploads move to R2? | All four: provider documents, client profile picture, provider logo, service setup image. | One storage model; removes base64 bloat everywhere. |
| D2 | Who can read files? | Provider documents are private: readable only by the owning provider and admins via signed GET URLs expiring in ~5 minutes. Profile pictures, logos and setup images are public-read. | Identity documents must never be public; listing images must load fast. |
| D3 | Upload mechanism | Server authenticates the user, validates type and size, issues a short-lived presigned PUT URL; browser uploads directly to R2; database stores only the object key. | Keeps large bodies off the app server and out of the database. |
| D4 | Existing base64 files | One-time migration script uploads them to R2 and replaces the base64 with keys. Run locally first. | Single format in code and backups. |
| D5 | Size limits | Documents: 1–4 files, ≤ 5 MB each, PDF/JPEG/PNG. Images: ≤ 5 MB, JPEG/PNG/WebP. | Old limits existed only because of base64. |
| D6 | Replaced or deleted files | Delete the old R2 object when a file is replaced or its owning account/service is deleted. | No orphan cost; no lingering ID copies. |
| D7 | Public image address | Cloudflare `r2.dev` public bucket URL, configured via `R2_PUBLIC_URL` so a custom domain can be swapped in later. | Free and enough for now; one-variable switch. |
| D8 | Backups | Backups contain only keys/URLs; docs state R2 files are not included. | Bundling files would exceed the backup size limit. |
| D9 | Configuration | Server-only env vars `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`. | Credentials never reach the browser. |

## Out of scope

- Custom domain for public files: postponed (D7).
- Including R2 files in app backups (D8).
- Image resizing, thumbnails, virus scanning: not requested.
- Keeping base64 files untouched or wiping them (D4 alternatives rejected).

## Acceptance criteria

- AC1: WHEN a signed-in user requests an upload URL for an allowed kind and valid type/size, THE SYSTEM SHALL return a presigned PUT URL valid for at most 10 minutes and the object key, scoped to that user.
- AC2: IF the upload-URL request is unauthenticated, THEN THE SYSTEM SHALL respond 401 and issue no URL.
- AC3: IF the declared type or size violates D5, THEN THE SYSTEM SHALL respond 400 with a readable message and issue no URL.
- AC4: IF a user requests an upload key for a resource they do not own (another user's profile, service or application), THEN THE SYSTEM SHALL respond 403.
- AC5: WHEN saving a profile, service or provider application, THE SYSTEM SHALL accept only R2 object keys under the caller's own prefix and SHALL reject base64 data URLs and foreign keys.
- AC6: WHEN the owning provider or an admin requests a provider document, THE SYSTEM SHALL return a signed GET URL that expires in about 5 minutes.
- AC7: IF any other user requests a provider document, THEN THE SYSTEM SHALL respond 403 and issue no URL.
- AC8: THE SYSTEM SHALL store provider documents under a key prefix that is not publicly readable, and public images under a prefix served via `R2_PUBLIC_URL`.
- AC9: WHEN a profile picture, logo or setup image is replaced, THE SYSTEM SHALL delete the previous R2 object.
- AC10: WHEN an account or service is deleted, THE SYSTEM SHALL delete its R2 objects.
- AC11: IF an R2 delete fails, THEN THE SYSTEM SHALL still complete the user's action and log the orphaned key.
- AC12: IF the browser upload to R2 fails, THEN THE SYSTEM SHALL show an error and SHALL NOT save a key for the failed file.
- AC13: WHEN the migration script runs, THE SYSTEM SHALL upload every base64 file to R2, replace it with its key, be safe to re-run (skip already-migrated entries), and print counts of migrated, skipped and failed files.
- AC14: THE SYSTEM SHALL never expose `R2_ACCESS_KEY_ID` or `R2_SECRET_ACCESS_KEY` to client code.
- AC15: WHEN a backup is created, THE SYSTEM SHALL include keys/URLs only, and `docs/backup-restore.md` SHALL state that R2 files are not included.
- AC16: IF R2 env vars are missing, THEN THE SYSTEM SHALL fail upload requests with a clear server error rather than falling back to base64.

## Non-functional and operational checks

| Area | Requirement or `not applicable` with reason | Evidence |
| --- | --- | --- |
| Security | Auth + ownership checks on every upload/read URL; server-only credentials; bucket private except public image prefix; CORS limited to app origins. | Tests for AC2–AC7, AC14; bucket config documented. |
| Privacy | IDs/permits never public; signed URLs short-lived; deleted on account deletion. | AC6–AC10 tests. |
| Accessibility | Existing upload inputs keep labels and error messages. | Manual check. |
| Performance | Account/service payloads no longer carry base64. | Payload size before/after noted in report. |
| Observability | Failed deletes and migration failures logged with key. | AC11, AC13 output. |
| Rollback | Migration keeps a local JSON export of pre-migration data; code revert plus restore from that export. | Migration dry-run and export recorded. |

## Follow-ups

- Move public images to a custom domain before production (D7).
- Decide a separate backup strategy for R2 objects.

## Change log

- 2026-10-12: spec approved.
