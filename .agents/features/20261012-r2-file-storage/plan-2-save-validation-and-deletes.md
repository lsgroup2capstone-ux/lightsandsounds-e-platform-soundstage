---
artifact: plan
schema: 1
feature: 20261012-r2-file-storage
revision: 1
status: plan-approved
risk: high-risk
---

# Plan 2: Save-path key validation and replacement deletes

- Feature: `.agents/features/20261012-r2-file-storage/spec.md`
- Design: `.agents/features/20261012-r2-file-storage/design.md`
- Implements decisions: D1, D3, D5, D6, P2 (service part)
- Spec revision: 1 (+ design P1/P2)
- Depends on: plan 1
- Status: plan-approved
- Estimate: about 260 lines of diff

## Goal

Profiles, services and provider applications accept only own-prefix R2 keys
whose objects exist. New base64 is rejected. Replaced profile pictures, logos
and service images are queued for deletion. Dropped services queue their
image. Booking rows follow a service's new image key.

## Evidence (checked in the repository)

- `lib/server/data-service.ts:60-66`: `serviceInput` accepts `image` as any string up to 1.5M characters.
- `lib/server/data-service.ts:68-84`: `updateProfile` accepts `profileImage` up to 1.5M characters. It also syncs the provider name into services and bookings (`:77-82`), which is the pattern to reuse for image keys.
- `lib/server/data-service.ts:178`: `submitProviderApplication` passes the raw array through.
- `lib/server/data-service.ts:180-192`: `saveProviderService` and `updateProviderServices`. Services that have bookings cannot be removed (`:190`).
- `lib/server/data-service.ts:215`: bookings copy `service.image`.
- `lib/server/domain/client-auth.ts:3`: `ProviderDocument = { name, type, data }`.
- `lib/server/domain/client-auth.ts:24-28`: `validateProviderDocuments` (1.4M characters total, data-URL prefix). Admin review also calls it (`:42`).
- `lib/client-auth.ts:185-187,199-201`: browser copies of the types and the validator.
- `lib/server/domain/provider-services.ts:13`: `ProviderService.image`.
- `tests/provider-applications.cjs:10`: fixture uses data-URL documents.

## Phases

### Phase 1: Types and validators

- `ProviderDocument` becomes `{ name: string; type: string; key: string; size: number }` in `lib/server/domain/client-auth.ts` and `lib/client-auth.ts`.
- Server `validateProviderDocuments(documents, ownerEmail)` requires:
  - 1–4 documents.
  - Each `name` non-empty and at most 200 characters.
  - Each `type` is pdf, jpeg or png.
  - Each `size` is an integer from 1 byte to 5 MB.
  - Each key passes `isOwnKey("provider-document", ownerEmail, key)`.
  - No document has a `data` field.

  `reviewProviderApplication` calls it with the provider's email.
- The browser `validateProviderDocuments` mirrors the shape checks without key ownership. Keep `readProviderDocuments` compiling (plan 3 removes it). Change only what the type change forces.

### Phase 2: Save paths (`lib/server/data-service.ts`)

- New `async verifiedKey(kind, email, value, previous?)`:
  - Empty value returns `""`.
  - A value equal to `previous` is returned as is, with no `HEAD`. This keeps legacy base64 saveable until migration.
  - `isDataUrl` or `!isOwnKey` returns 400 "Upload the file again."
  - Otherwise send `headObject`. A missing object, an oversized one or a wrong type returns 400 "The upload did not finish. Please try again."
- `updateProfile` becomes async. `profileImage` goes through `verifiedKey("profile-image", actor.email, value, actor.profileImage)`. If the value changed and the old value is a key, queue the old key.
- `serviceInput` becomes async. `image` goes through `verifiedKey("service-image", …, previousImageForSameId)`. `saveProviderService` awaits it, and `updateProviderServices` awaits it with `Promise.all`.
- `updateProviderServices`:
  - For a retained service with a changed image, rewrite `image` on every booking with that `packageId`, then queue the old key.
  - For a removed service, queue its image key.
- `submitProviderApplication`: `HEAD` every document key, then call the domain. On resubmission after a rejection, queue old document keys that are no longer used.
- The touched action entries return awaited results. `execute()` already awaits actions (`:367`).

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T2.1 | plan 1 | both `client-auth.ts` | none (supports AC5) | `npm run typecheck`; `tests/provider-applications.cjs` fixture switched to `{ name, type, key, size }` |
| T2.2 | T2.1 | `data-service.ts` save paths | AC5 | `tests/r2-files.cjs`: profile, service and application saves reject a data URL, a foreign key and a wrong-kind key; they accept an own key when the stubbed HEAD returns 200; a HEAD 404 gives 400 |
| T2.3 | T2.2 | `updateProfile`, `updateProviderServices` | AC9 | tests: replacing a picture, logo or service image queues the old key once; an unchanged key queues nothing; bookings get the new image key |
| T2.4 | T2.2 | `updateProviderServices` | none here (supports AC10, owned by plan 4 T4.3) | tests: a dropped service queues its image key |

## Tests

- Save validation, replacement deletes and removal deletes → new cases in `tests/r2-files.cjs`.
- Domain validator shape → `tests/provider-applications.cjs`.

## Out of scope

- Custom domain for public files (D7, postponed).
- Including R2 files in app backups (D8).
- Image resizing, thumbnails, virus scanning.
- Keeping base64 files untouched or wiping them (D4 alternatives rejected).
- A new in-app delete-account feature (P2).
- Deferred: the browser upload flow and rendering (plan 3), and migrating existing base64 (plan 4).

## Acceptance

- Spec: AC5, AC9.
- Technical: an unchanged legacy value sent back as is stays saveable before migration; all new base64 is rejected.

## Verification

- Routine local checks: `npm run typecheck`, `npm test`.
- Scoped operations: none.
- Manual: none (the UI arrives in plan 3).

## Expert skills to apply

- none matched.

## Risks and stop points

- Under the unchanged-value exception, a legacy data URL survives a save until migration. If the reviewer reads AC5 as forbidding that, **stop and ask**. The fallback is to run plan 4's migration before deploying plan 2.
- `HEAD` runs inside the advisory-lock transaction and adds latency to each save. If tests show contention, **stop and report**.
