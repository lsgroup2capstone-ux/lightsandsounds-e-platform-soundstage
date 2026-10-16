---
artifact: spec
schema: 1
feature: 20261014-provider-document-categories
revision: 2
status: spec-approved
risk: high-risk
---

# Provider document categories and scan review

- Feature id: 20261014-provider-document-categories
- Revision: 2
- Status: spec-approved
- Risk lane: high-risk (uploads, stored data shape, personal ID data)
- Approved by: user, 2026-10-14
- Related decisions: none

## Problem

Providers upload their business permit / DTI registration and valid ID as one
untyped set of files. Admins cannot tell which file is which, and nothing
ensures both kinds were submitted.

Facts found in the code:

- `ProviderDocument` is `{ name, type, key, size }` with no category, defined
  twice: `lib/client-auth.ts:192` and `lib/server/domain/client-auth.ts:4`.
- Server validation (`lib/server/domain/client-auth.ts:25-28`) checks count
  1–4, MIME type, size ≤ 5 MB, no inline `data`, and key ownership via
  `isOwnKey("provider-document", ...)`. It does not check document kinds.
- `submitProviderApplication` (`lib/server/domain/client-auth.ts:29-36`)
  rebuilds each document from `name, type, key, size`, so any extra field is
  dropped today.
- Client upload (`lib/client-auth.ts:213-218`) maps `File[]` to documents with
  no category.
- The provider form (`components/hubs/provider-applications.tsx:35`) already
  has two separate inputs, `permitDocuments` and `idDocuments` (an uncommitted
  change made 2026-10-14). These are concatenated before upload.
- The admin view `Documents` (`components/hubs/provider-applications.tsx:11-25`)
  lists files in a flat list; `getProviderDocumentUrl` opens a file by index.
- No OCR or AI dependency exists in `package.json` (checked 2026-10-14).

## Decisions

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | Store a document kind? | Add optional `category: "permit" \| "id"` to `ProviderDocument` (client and server types). | Lets admins see which file is which. |
| D2 | Enforce both kinds? | New submissions must include at least one `permit` and one `id` document; otherwise reject with a clear message. | The point of separating the fields. |
| D3 | File limit | Keep 4 files total across both kinds. | No change to storage limits. |
| D4 | Legacy applications | Documents without `category` stay valid; shown as "Uncategorized". No resubmission. | Avoid forcing existing providers to redo work. |
| D5 | Admin display | Group documents under "Business permit / DTI", "Valid ID", and "Uncategorized" (only when present). | Faster review. |
| D6 | Feature placement | New feature, separate from `20261009-provider-module`; includes the already-made two-field form. | Provider-module plan 1 is approved and awaiting ship. |
| D7 | How to scan documents | Tesseract.js in the provider's browser; files are not sent to any third party for OCR. | Free and keeps ID images off third-party services. |
| D8 | When scanning runs | Automatically when a JPG/PNG is chosen in either input. PDFs are not scanned; the provider types the fields. | Tesseract.js does not read PDFs without extra rendering work. |
| D9 | Fields extracted | Permit: business name, permit/DTI number, expiry date. ID: full name, ID type, ID number, birthdate, expiry date. | Enough for admin verification. |
| D10 | Review form | Scanned values prefill an editable form; blank fields are filled by hand; every field is required before submit. | Scans are unreliable; the provider confirms. |
| D11 | What is stored | Both the scanned value and the confirmed value per field, saved on the application. | Lets admins see provider edits. |
| D12 | Server checks | Server validates confirmed details (required, length limits, valid dates). Scanned values are client-supplied and treated as an untrusted hint only. | The browser can send anything. |
| D13 | Admin display of details | Confirmed details shown with each document group; fields that differ from the scan are marked "edited by provider" with the scanned value beside them. | Helps catch typed-over values. |
| D14 | Name match | No blocking. Admin view shows a "name differs from account" warning when the ID full name does not match the account's first + last name (case- and whitespace-insensitive). | Admin judges; OCR and naming variants make hard blocks unfair. |
| D15 | Access to ID details | Visible only to admins and the owning provider; stored only on the application. | Personal data. |

## Out of scope

- Per-field limits (e.g. 3 each): rejected, D3.
- Forcing legacy providers to resubmit: rejected, D4.
- Data migration of stored documents: not needed, D4.
- Cloud OCR / AI vision: rejected for now, D7 (accuracy may be revisited).
- OCR of PDFs: postponed, D8.
- Blocking on name mismatch or failed scans: rejected, D10, D14.
- Forcing legacy applications to add details: rejected, D4. Legacy applications show no details section.

## Acceptance criteria

- AC1: THE provider application form SHALL show two required file inputs, "Business permit / DTI registration" and "Valid ID", each accepting PDF, JPG or PNG.
- AC2: WHEN a provider submits, THE SYSTEM SHALL store each uploaded document with `category` `permit` or `id` matching the input it came from.
- AC3: IF a submission lacks at least one `permit` document or at least one `id` document, THEN THE server SHALL reject it with a message naming the missing kind, and no application is saved.
- AC4: IF a document's `category` is present but not `permit` or `id`, THEN THE server SHALL reject the submission.
- AC5: IF the total number of documents is 0 or more than 4, THEN THE SYSTEM SHALL reject the submission (existing behavior preserved).
- AC6: THE server SHALL keep all existing per-document checks (MIME type, size ≤ 5 MB, no inline data, key owned by the submitting provider).
- AC7: WHEN an admin views an application, THE SYSTEM SHALL group documents under "Business permit / DTI" and "Valid ID", and SHALL show documents without a category under "Uncategorized" only when such documents exist.
- AC8: WHEN an admin opens any document (grouped or uncategorized), THE SYSTEM SHALL open the correct file (index mapping to the stored array unchanged).
- AC9: THE SYSTEM SHALL continue to load, display and allow review of applications stored before this change without error.
- AC10: WHEN a provider chooses a JPG or PNG in either input, THE SYSTEM SHALL scan it in the browser and prefill that kind's fields (D9) with any values found, showing a visible "scanning" state while it runs.
- AC11: THE SYSTEM SHALL NOT send document images to any third-party service for scanning.
- AC12: WHEN a PDF is chosen, or a scan fails or finds nothing, THE SYSTEM SHALL leave the fields blank and editable, with a short note asking the provider to type them.
- AC13: THE submit button SHALL stay disabled until every D9 field for both kinds is filled; WHEN the provider submits, THE SYSTEM SHALL save the confirmed and scanned values with the application.
- AC14: IF the server receives details with a missing required field, a value over the length limit, or an invalid date, THEN THE server SHALL reject the submission with a message naming the field, and no application is saved.
- AC15: WHEN an admin views an application, THE SYSTEM SHALL show the confirmed details with each document group and mark each field whose confirmed value differs from the scanned value as "edited by provider", showing the scanned value.
- AC16: IF the ID full name does not match the account's first and last name (ignoring case and extra spaces), THEN THE admin view SHALL show a "name differs from account" warning; THE SYSTEM SHALL NOT block submission or review because of it.
- AC17: IF a user is neither an admin nor the owning provider, THEN THE SYSTEM SHALL NOT return the application's details.
- AC18: WHEN an application without details (stored before revision 2) is shown, THE SYSTEM SHALL show no details section and SHALL still allow review.

## Non-functional and operational checks

| Area | Requirement or `not applicable` with reason | Evidence |
| --- | --- | --- |
| Security | Category is validated server-side (AC3, AC4); ownership checks unchanged (AC6). | Unit tests on server validation |
| Privacy | Stores ID number and birthdate (D15); OCR runs locally (AC11); access limited to admin and owner (AC17). | Unit test for AC17; network check during scan |
| Accessibility | Each input has a visible label; group headings are real headings or labelled sections. | Manual check |
| Performance | Tesseract.js and its language data load only when the form is used (lazy import), not on other pages. | Bundle check / manual network check |
| Observability | Existing "Provider application submitted" audit entry unchanged. | Test or manual check |
| Rollback | Revert the commit; stored `category` fields are ignored by old code (rebuilt from name/type/key/size). | Code inspection |

## Follow-ups

- None.

## Change log

- 2026-10-14: spec approved.
- 2026-10-14: revision 2; added D7-D15, AC10-AC18; no plans yet; reason: user asked for scan-and-review of permit and ID.
