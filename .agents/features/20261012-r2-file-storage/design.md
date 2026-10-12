# Design: R2 file storage

- Feature: `.agents/features/20261012-r2-file-storage/spec.md`
- Spec revision: 1 (plus two planning answers from the user on 2026-10-12, listed below, that still need to be added to the spec as rev 2)
- Risk lane: high-risk

## Planning answers not yet in the spec (user, 2026-10-12)

- **P1 (signup documents):** Remove the file input from provider signup.
  Providers upload permit/ID documents on `/provider/application` after they
  sign in. This keeps AC2 strict (every upload URL needs a signed-in user).
- **P2 (AC10 scope):** "Account deleted" means removal by
  `scripts/clear-client-provider-data.cjs`. "Service deleted" means a service
  dropped through `updateProviderServices`. No new delete-account feature.

Run `/sdd-specify` to record these as D10/D11 (spec rev 2) before or together
with plan approval.

## Context and constraints

- All app data is JSON in `soundstage.records`, read and written in one
  transaction under `pg_advisory_xact_lock(74832019)`
  (`lib/server/data-service.ts:327-388`).
- The only browser write surface is the `actions` allowlist
  (`lib/server/data-service.ts:139`), called through `POST /api/data`
  (`app/api/data/route.ts`).
- No S3/R2 client is installed. Plan 1 adds **`aws4fetch` (exact version,
  zero dependencies)** for SigV4 presigning and signed `HEAD`/`DELETE`. This
  is a new dependency and needs the user's approval at plan approval time.
  Alternative: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
  (heavier, many transitive packages).

## Ownership and data flow

| State | Owner | Notes |
| --- | --- | --- |
| R2 credentials, bucket, public base URL | `lib/server/r2.ts` (server-only) | Reads env on each call; missing var raises `RequestError(..., 503)` "File storage is not configured." (AC16) |
| Key format and ownership rules | `lib/server/file-keys.ts` (pure, no Node-only imports besides `node:crypto`) | Single place that builds and checks keys |
| Which key a record holds | Existing domain modules via `data-service.ts` actions | Records store keys only |
| Public image URL | Browser helper `publicFileUrl(key)` in `lib/file-upload.ts` | Uses `filesBaseUrl` returned with every `/api/data` response |

Upload flow (D3):

1. Browser calls action `createUploadUrl(kind, { type, size, serviceId? })`.
2. Server checks role, ownership, type, size (D5). It builds a key under the
   caller's prefix and returns `{ key, url, headers, expiresAt }`. The
   presigned PUT is valid for 600 s and signs `content-type` and
   `content-length`. R2 therefore rejects a body that differs from the
   declared type or size.
3. Browser `PUT`s the file to R2. On a non-2xx response or network error, it
   shows an error and does not save (AC12).
4. Browser saves the profile, service or application with the key.
5. On save, the server checks prefix ownership (AC5). It then sends `HEAD`
   for the object and requires it to exist with a size within limits and the
   expected content type. A missing object is rejected (AC12 server side).
6. After the transaction commits, the server deletes replaced objects (D6).

Read flow for documents (D2): action `getProviderDocumentUrl(email, index)`
lets the provider read their own documents and lets an admin read anyone's.
It returns a presigned GET valid for 300 s (AC6). Anyone else gets 403 (AC7).

## Contracts

### Key format (`lib/server/file-keys.ts`)

```
owner = sha256(lower(trim(email))).hex.slice(0, 32)   // no email in public URLs
private/provider-docs/<owner>/<id>.<ext>              // never public (AC8)
public/profile/<owner>/<id>.<ext>                     // client picture or provider logo
public/service/<owner>/<id>.<ext>
```

- `<id>`: `crypto.randomUUID()` for new uploads. The migration uses the first
  32 hex characters of the content's sha256, so re-runs produce the same key
  and are safe (AC13).
- `<ext>`: one of `pdf|jpg|png|webp`, taken from the validated MIME type,
  never from the file name.
- Exports: `ownerSegment(email)`, `buildKey(kind, email, id, type)`,
  `isOwnKey(kind, email, key)` (strict regex
  `^<prefix>/<owner>/[a-f0-9-]{32,36}\.(pdf|jpg|png|webp)$`),
  `isDataUrl(value)`, `KIND_RULES` (D5 types and the 5 MB limit per kind).

### Kinds and rules (D5)

| Kind | Roles | Types | Max | Prefix |
| --- | --- | --- | --- | --- |
| `provider-document` | provider | pdf, jpeg, png | 5 MB each; 1–4 per application | `private/provider-docs` |
| `profile-image` | client, provider | jpeg, png, webp | 5 MB | `public/profile` |
| `service-image` | provider | jpeg, png, webp | 5 MB | `public/service` |

`service-image` with `serviceId` that belongs to another provider's service
key returns 403 (AC4). A `serviceId` that matches no service is allowed (a new
service being created). The key is always under the caller's own owner
segment, so a caller can never write into another user's prefix.

### Actions added to the allowlist

- `createUploadUrl(kind: string, meta: { type: string; size: number; serviceId?: string })`
  returns `{ key, url, headers: { "Content-Type", "Content-Length" }, expiresAt }`.
- `getProviderDocumentUrl(email: string, index: number)` returns `{ url, expiresAt, name, type }`.

`/api/data` responses gain `filesBaseUrl: string | null`, which is
`R2_PUBLIC_URL` without a trailing slash. It is a public value. It is not a
credential and not a `NEXT_PUBLIC_` variable (D9).

### Data shapes

- `ProviderDocument = { name: string; type: string; key: string; size: number }`
  (replaces `data`).
- `ClientAccount.profileImage?: string` holds a `public/profile/...` key.
- `ProviderService.image: string` and `Booking.image` hold a `public/service/...`
  key or `""`.

### Env (D9) — server-only, added to `.env.example` with empty values

`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`,
`R2_PUBLIC_URL`. Endpoint: `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`.

## Failure, security, and rollback

- Trust boundary: the browser sends kind, type, size and key. All of these
  are untrusted. The server (`data-service.ts` actions plus
  `file-keys.ts`/`r2.ts`) is the only control owner. R2 enforces the signed
  type and size on PUT, and the server checks them again with `HEAD` on save.
- Negative cases and their evidence:

  | Case | Expected | Evidence |
  | --- | --- | --- |
  | No session | 401 (existing `execute` guard, `data-service.ts:328`) | `tests/r2-files.cjs` |
  | Wrong role for kind | 403 | `tests/r2-files.cjs` |
  | Bad type, size ≤ 0, size > 5 MB | 400, readable message | `tests/r2-files.cjs` |
  | `serviceId` owned by another provider | 403 | `tests/r2-files.cjs` |
  | Save with data URL | 400 | `tests/r2-files.cjs` |
  | Save with another user's key, or a wrong-kind prefix | 400 | `tests/r2-files.cjs` |
  | Save with key whose object is missing (failed PUT) | 400 | `tests/r2-files.cjs` (stubbed `HEAD`) |
  | Document URL requested by another provider or a client | 403 | `tests/r2-files.cjs` |
  | Missing env | 503 "File storage is not configured." | `tests/r2-files.cjs` |
  | Delete fails | Action succeeds; `console.error("R2 delete failed", { key })` | `tests/r2-files.cjs` |
  | Credentials in client bundle | Absent | `r2.ts` starts with `import "server-only"`; after `npm run build`, grep `.next/static` for `R2_SECRET_ACCESS_KEY`/`R2_ACCESS_KEY_ID` (AC14) |

- Delete timing: replaced or removed keys go into a per-request
  `pendingDeletes` array on the runtime context. They are deleted only after
  `sql.begin` resolves, so a rolled-back save never deletes the live file. Each
  delete failure is caught and logged (AC11).
- Bookings copy `service.image` at booking time (`data-service.ts:215`). When
  a service image is replaced, booking rows with the old key are updated to
  the new key in the same transaction (same pattern as the provider-name sync
  at `data-service.ts:77-82`), and only then is the old key deleted.
- Bucket: private by default. Public access (r2.dev) is limited to the
  `public/` prefix. R2's r2.dev toggle is bucket-wide, so the implementer
  must verify whether prefix scoping is possible. If it is not, **stop and
  ask** (options: two buckets, or a custom domain with a WAF rule). CORS
  allows `PUT` and `GET` from app origins only. The setup is documented in
  `docs/r2-setup.md` (plan 4).
- Rollback: before writing, the migration writes a local JSON export of all
  `soundstage.records` to `backups/r2-premigration-<timestamp>.json`
  (gitignored). Recovery is a code revert plus a restore of that export with
  the script's `--restore <file>` mode. R2 objects can stay; they are harmless
  orphans.

## Non-functional evidence

- Performance: the implementer records the byte size of the GET
  `/api/data` payload before and after migration on the local DB in
  `impl-4`.
- Accessibility: existing labels, `role="status"`/error text kept; manual
  keyboard check in plan 3.
- Observability: delete failures and migration failures are logged with the
  key only. No URLs with signatures, and no credentials.

## Alternatives rejected

- Server-proxied uploads: they keep large bodies on the app server (D3).
- Storing full public URLs: AC5 requires keys, and keys keep the D7 domain swap to one variable.
- Email in keys: it would leak personal data in public image URLs.
- Deleting inside the transaction: a rollback would leave records pointing at deleted objects.
