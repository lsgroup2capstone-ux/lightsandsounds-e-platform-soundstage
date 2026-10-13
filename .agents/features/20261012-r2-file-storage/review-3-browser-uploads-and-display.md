---
artifact: review
schema: 1
feature: 20261012-r2-file-storage
revision: 1
status: pass
risk: high-risk
---

# Review 3: Browser uploads, document viewing and image display

- Plan: `plan-3-browser-uploads-and-display.md`
- Spec: `spec.md` (rev 1 + design P1/P2)
- Reviewer: fresh Claude Code session (`/sdd-review`)
- Independent from implementation: yes (did not write the plan 3 code)
- Baseline: HEAD `00f854c`, uncommitted working tree
- Diff scope: `lib/app-store.ts`, `lib/client-auth.ts`, `lib/file-upload.ts` (new), `components/auth/signup-form.tsx`, `components/dashboard/client-dashboard.tsx`, `components/hubs/{admin-accounts,hub-workspace,provider-applications}.tsx`, `components/site/{package-card,provider-service-detail}.tsx`, `tests/file-upload.cjs` (new), `tests/clerk-password.cjs`, `package.json`. Not in scope: `tsconfig.tsbuildinfo`, `G2-Sound-Stage/`, `sdd-kit/` (leave out of the ship commit).

## Round 1 (2026-10-12)

- Scope reviewed: all (Part A + Part B)
- Verdict: **pass**

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| lint | not installed |
| `npm test` | 57 tests, 57 pass, 0 fail |
| `npm run build` | success; `next-env.d.ts` rewritten by build, restored with `git checkout` |
| `grep -rl "R2_SECRET_ACCESS_KEY\|R2_ACCESS_KEY_ID" .next/static` | no matches (exit 1) |

### Spec decisions

- D1/D2/D3/D5/D7/P1: no contradictions. Only keys are saved; images use `filesBaseUrl + "/" + key` (`lib/file-upload.ts` `publicFileUrl`); documents open through signed URLs fetched on click; D5 limits mirrored client-side and re-checked by the server; signup no longer takes documents (P1).
- Server accepts `service-image` uploads without `serviceId` (`lib/server/data-service.ts:198`), so the setup-image flow is valid.
- `next.config` has `images.unoptimized: true`, so R2 URLs work in `next/image` (PackageCard, BookingRow).

### Acceptance

| Criterion | Met? | Evidence |
| --- | --- | --- |
| AC12 | yes | `tests/file-upload.cjs` "a failed PUT throws and no save mutation follows" (500 and network error); handlers set the key only after `uploadFile` resolves (`client-dashboard.tsx` `selectImage`, `hub-workspace.tsx` `selectImage`/`selectSetupImage`); `uploadProviderDocuments` rejects before `submitProviderApplication` (`provider-applications.tsx` form submit) |
| AC14 (evidence for plan 1) | yes | build + grep above |

### Traceability

| Task | Test/evidence | Result |
| --- | --- | --- |
| T3.1 | `tests/file-upload.cjs` (4 tests, in `npm test`) | met |
| T3.2 | code read of all handlers and render sites; manual not run | met (code); manual outstanding |
| T3.3 | code read; `tests/clerk-password.cjs` asserts no pending documents at signup | met (code); manual outstanding |
| T3.4 | build + grep run by reviewer | met |

### Deviations judged

1. Root-relative passthrough in `publicFileUrl`: accepted. Needed for bundled catalog images; `//host` still blocked and tested.
2. `app/services/[id]/page.tsx` not wrapped: accepted. It renders only mock catalog paths on the server.
3. Dropping `Content-Length` from PUT headers: accepted. Browsers forbid it; tested.
4. Blank-tab-then-navigate for "Open document": accepted. `opener` nulled and fallback uses `noopener`.
5. `admin-accounts.tsx` switched to `Documents`: accepted. Without it, admins would see broken `doc.data` links after migration; it's a small, necessary change.
6. `hub-workspace.tsx` over 300 lines: pre-existing, net zero lines. Not blocking.
7. Orphaned keys when the user leaves without saving: accepted; plan 4 cleanup must cover it (see F2).

### Findings

| # | Severity | Finding | Where | Required fix |
| --- | --- | --- | --- | --- |
| F1 | minor | Logo and setup-image uploads show no in-progress state, and the Save/Publish button stays enabled during upload. A user who saves mid-upload saves the old value, with no feedback. The client profile shows "Uploading picture..." but its Save button is also enabled. | `components/hubs/hub-workspace.tsx` `selectImage`, `selectSetupImage`; `components/dashboard/client-dashboard.tsx` `selectImage` | Track an `uploading` flag, show a `role="status"` "Uploading..." message and disable the submit button while it is true. |
| F2 | minor | `uploadProviderDocuments` uploads in parallel. If one file fails, the others are already in R2 and are never referenced (orphaned private objects). | `lib/client-auth.ts` `uploadProviderDocuments` | No code change required now. Plan 4's cleanup script must also sweep unreferenced `private/` document keys. |
| F3 | minor | `Documents` can be clicked again while a signed-URL request is pending, which opens extra blank tabs. | `components/hubs/provider-applications.tsx` `Documents.open` | Optional: disable the button for that index while its request is pending. |

The earlier review's deploy-coupling finding still applies: do not deploy plans 2–3 before plan 4's migration.

### Unverified checks (manual / operational; need a dev R2 bucket with CORS for `http://localhost:3000`)

- Upload, replace and view the profile picture, logo and setup image; GET `/api/data` contains no new `data:` values.
- Provider signs up without files, uploads on `/provider/application`; admin opens a document from both the applications hub and admin accounts; the link expires after about 5 minutes.
- Google signup still lands unapproved providers on `/provider/application` (code unchanged; `finishSignup` now only refreshes).
- Keyboard-only upload on each input; error text is announced.
- With bucket CORS off, a failed upload shows an error and the old image stays.
- A client calling `getProviderDocumentUrl` from the console gets 403 (server-side covered by plan 1 tests).

### Expert skills

- None matched (index and folder scan for `review`).
