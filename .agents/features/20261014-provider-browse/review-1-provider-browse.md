---
artifact: review
schema: 1
feature: 20261014-provider-browse
revision: 1
status: changes-requested
risk: standard
---

# Review 1: Provider-first browse

- Plan: `plan-1-provider-browse.md`
- Spec: `spec.md` revision 2
- Reviewer: Codex session, 2026-10-15
- Independent from implementation: yes
- Baseline: `bcbd0dd2bf18c9ea2601cbd67225de7409e85583`
- Diff scope: current working-tree changes in `.agents/features/20261009-client-module/spec.md`, `app/browse/page.tsx`, `app/providers/[id]/page.tsx`, `components/browse/{services-browser,provider-card,provider-profile}.tsx`, `components/hubs/hub-workspace.tsx`, `lib/{client-auth,provider-services}.ts`, `lib/server/{data-service,domain/provider-services}.ts`, `tests/provider-browse.cjs`, and `package.json`. Shared files include later Service Ratings changes and were reviewed in their current combined state.

## Round 1 (2026-10-15)

- Scope reviewed: all of Provider Browse plan 1 against spec revision 2 and the current combined working tree
- Verdict: changes-requested

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `npm run typecheck` | Did not start: PowerShell blocked `npm.ps1`; rerun as `npm.cmd run typecheck`. |
| `npm.cmd run typecheck` | Pass. |
| `node --test tests/provider-browse.cjs` | Pass, 5/5. |
| `npm.cmd test` | 108/109 pass; `tests/system-activity.cjs:19` fails on an unrelated expected refund link, matching the pre-existing failure recorded by the implementation report. |
| `npm.cmd run lint` | Not runnable: `eslint` is not installed/resolvable from the script. |

### Acceptance

| Criterion | Met? | Evidence |
| --- | --- | --- |
| AC1 | yes | `lib/provider-services.ts:69-94`; `components/browse/provider-card.tsx:11-50`; focused tests cover grouping and service-less providers. |
| AC2 | yes | `components/browse/provider-card.tsx:14`. |
| AC3 | yes | `app/providers/[id]/page.tsx:10-19`; `components/browse/provider-profile.tsx:28,114`. |
| AC4 | yes | `components/browse/provider-profile.tsx:28,50-58`; public provider input is filtered by `lib/client-auth.ts:206`. |
| AC5 | no | `/browse` renders only search and rating sort at `components/browse/services-browser.tsx:52-72`; Category and Price dropdowns are absent. |
| AC6 | no | `components/browse/services-browser.tsx:29-42` filters only by search and sorts by rating; category and price are not applied. |
| AC7 | yes | `components/browse/services-browser.tsx:29-34`. |
| AC8 | no | `components/browse/services-browser.tsx:12,18,35-41,69-71` offers rating ascending/descending instead of Recommended and starting-price sorts. |
| AC9 | yes | `components/hubs/hub-workspace.tsx:203,227`; server whitelist at `lib/server/data-service.ts:76,82`. |
| AC10 | yes | `lib/provider-services.ts:49-51`; `tests/provider-browse.cjs` focused test. |
| AC11 | yes | `components/browse/services-browser.tsx:83-94`. |
| AC12 | partly | Service-less providers and the profile empty state exist (`lib/provider-services.ts:86-91`, `components/browse/provider-profile.tsx:100-106`), but `/browse` has no category/price filter state with which to exclude them as required. |

### Traceability

| Task | Test/evidence | Result |
| --- | --- | --- |
| T1.1 | category field, server validation, focused test | met |
| T1.2 | grouping helpers and focused tests | met |
| T1.3 | current `/browse` UI | not met: AC5, AC6, AC8 and part of AC12 regressions |
| T1.4 | provider route/profile code | met; manual browser check remains unverified |
| T1.5 | client-module D4 note | met |

### Findings

| # | Severity | Finding | Where | Required fix |
| --- | --- | --- | --- | --- |
| F1 | major | The current `/browse` UI no longer renders the always-visible Category and Price selectors and does not apply their combined filter. This fails AC5, AC6, and the filtered-state part of AC12. | `components/browse/services-browser.tsx:12-72` | Restore Category and Price state, labelled selectors, combined service matching, reset behavior, and service-less-provider exclusion while either filter is active. Preserve the Service Ratings display when reconciling the shared file. |
| F2 | major | Provider sorting was replaced with rating ascending/descending, but AC8 requires Recommended, Lowest starting price, and Highest starting price. | `components/browse/services-browser.tsx:12,18,35-41,69-71` | Restore the three approved sort options and their price ordering, keeping service-less providers after priced providers. Ratings may remain display-only unless the spec is revised. |
| F3 | minor | Plan 1 still declares spec revision 1 and has no task mapping for revision-2 D9/AC12; the implementation report carries the fix informally. | `plan-1-provider-browse.md:4-12`; `impl-1-provider-browse.md:50-57` | Have the planner revalidate the plan against spec revision 2 and add D9/AC12 traceability before the fix round is approved for implementation. |

### Scope check

- Changes outside the Provider Browse plan are present in shared files from the later Service Ratings feature. That layering is declared in its implementation report but caused F1 and F2 in `services-browser.tsx`.
- Manual browser, keyboard, unknown-provider, filter, sort, and add-service checks were not run and remain unverified.
- Expert skill applied: `supabase` for review of the approved-provider public data boundary. No schema, RLS, or database operation was changed or executed.

## Round 2 (2026-10-15)

- Scope reviewed: whole plan after fix round 1, including resolution of round-1 findings F1-F3
- Verdict: changes-requested
- Baseline: `ec0c880848430e02f2c12417e06d8f8cf2665bd2`
- Diff scope: current working-tree changes in `.agents/features/20261009-client-module/spec.md`, `app/browse/page.tsx`, `app/providers/[id]/page.tsx`, `components/browse/{services-browser,provider-card,provider-profile}.tsx`, `components/hubs/hub-workspace.tsx`, `lib/{client-auth,provider-services}.ts`, `lib/server/{data-service,domain/provider-services}.ts`, `tests/provider-browse.cjs`, and `package.json`. Shared files still contain the declared Service Ratings layer.

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `git diff --check -- <Provider Browse paths>` | Pass; only Git's existing LF-to-CRLF warnings were printed. |
| `npm.cmd run typecheck` | Pass. |
| `node --test tests/provider-browse.cjs` | Pass, 10/10. |
| `node --test tests/service-ratings.cjs` | Pass, 4/4. |
| `npm.cmd test` | 113/114 pass. `tests/system-activity.cjs:19` remains the sole failure; `git diff --quiet HEAD -- tests/system-activity.cjs lib/system-activity.ts` returned 0, proving those failing files are unchanged from the baseline. |
| `npm.cmd run lint` | Not runnable: `eslint` is not installed/resolvable. |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/sdd-doctor.ps1 -Path .` | Failed with 214 repository-wide failures and one warning (placeholder `project.md`, other features' traceability/staleness, missing skill mirrors, and baseline warning). It reported no Provider Browse traceability failure. |
| Focused identity probe through `tests/ts-loader.cjs` | Two approved accounts and two services sharing one display name collapsed to one profile; the profile bio came from the first service instead of either account. |
| Focused admin/public probe through `tests/ts-loader.cjs` | `getPublicProviders()` returned `Pending Co` from an unapproved provider's active service while the current account was Admin. |

### Acceptance

| Criterion | Met? | Evidence |
| --- | --- | --- |
| AC1 | no | `lib/provider-services.ts:53,76-94` keys profiles by mutable display name, so distinct approved accounts can collapse into one card; the focused probe reproduced it. `lib/provider-services.ts:31-42,97-98` also lets Admin's public browse include unapproved providers (F4-F5). |
| AC2 | yes | `components/browse/provider-card.tsx:11-15`; `app/providers/[id]/page.tsx:10-16` canonicalizes the decoded route parameter. Manual navigation remains unverified. |
| AC3 | no | `components/browse/provider-profile.tsx:112-115` uses `PackageCard`, whose provider-service branch links to `/listed-services/[id]` at `components/site/package-card.tsx:16-24`, not the specified `/services/[serviceId]`. Service-backed profiles also use the first service description instead of the approved account bio (`lib/provider-services.ts:86-92`). |
| AC4 | no | The focused Admin probe reached an unapproved provider through the public-provider helper because `getProviderServices()` bypasses approval for Admin (`lib/provider-services.ts:31-42`). |
| AC5 | yes | Always-visible labelled native selects at `components/browse/services-browser.tsx:51-78`. |
| AC6 | yes | Same-service combined predicate at `lib/provider-services.ts:110-126`; focused regression test passes. |
| AC7 | yes | Case-insensitive provider/location/service search at `lib/provider-services.ts:115-119`; focused test passes. |
| AC8 | yes | Approved sort options at `components/browse/services-browser.tsx:80-88`; price/service-less ordering at `lib/provider-services.ts:129-140`; focused test passes. |
| AC9 | yes | Required category input at `components/hubs/hub-workspace.tsx:203,227`; server allowlist/default at `lib/server/data-service.ts:76-82`. Manual form check remains unverified. |
| AC10 | yes | `lib/provider-services.ts:49-51`; focused fallback and mapping test passes. |
| AC11 | yes | Empty states and Clear filters action at `components/browse/services-browser.tsx:98-111`. Manual UI check remains unverified. |
| AC12 | partly | Default/filter/sort behavior passes focused tests, but `lib/provider-services.ts:89-92` drops an approved service-less account when its display name matches an existing grouped provider (F4). |

### Traceability

| Task | Test/evidence | Result |
| --- | --- | --- |
| T1.1 | Category fallback, source allowlist test, typecheck | met by automation; manual required-select check unverified |
| T1.2 | Grouping/search/filter/sort tests plus reviewer identity probes | not met: grouping is not per stable approved account and account metadata is not joined |
| T1.3 | Current `/browse`, focused helper tests | partly met: round-1 filter/sort regressions are fixed, but AC1 approval/identity failures remain; manual UI checks unverified |
| T1.4 | Provider route/profile inspection | not met: AC3 route and profile-metadata failures; AC4 Admin/unapproved failure |
| T1.5 | Account-only focused tests plus identity probe | partly met: ordinary case passes, same-name approved account is dropped |
| T1.6 | `.agents/features/20261009-client-module/spec.md:44` | met |

### Findings

| # | Severity | Finding | Where | Required fix |
| --- | --- | --- | --- | --- |
| F4 | major | Provider identity is the mutable display name, not a stable approved-account identity. A rename changes the public URL, and two accounts with the same displayed name merge into one card/profile; a service-less account with that name is silently dropped. This fails AC1/AC12 and the spec's stable-id follow-up. | `lib/provider-services.ts:53,70-94`; rename propagation at `lib/server/data-service.ts:91-100` | Retain the service owner identity while reading public services, group/join by a stable public provider id, and use the display name only as presentation. Add focused cases for duplicate display names, service-less same-name accounts, and rename-stable lookup. |
| F5 | major | `getPublicProviders()` is viewer-dependent: Admin's `getProviderServices()` bypasses provider approval, so the public `/browse` and `/providers/[id]` surfaces expose active services from unapproved providers to an Admin. This contradicts AC1/AC4 and the approved-only public rule. | `lib/provider-services.ts:31-42,97-98` | Build the public-provider list from an approval-enforcing service source for every viewer, while keeping any Admin all-services read separate. Add signed-out and Admin-context negative tests for unapproved providers. |
| F6 | major | Provider-profile service cards route stored services to `/listed-services/[id]`, while D3/AC3 explicitly requires `/services/[serviceId]`. The plan's preservation/out-of-scope note cannot override the approved spec. | `components/browse/provider-profile.tsx:112-115`; `components/site/package-card.tsx:16-24`; `plan-1-provider-browse.md:82,117,140` | Make the specified `/services/[serviceId]` route resolve provider services and link these cards there, then add a route assertion. If the product should keep `/listed-services`, revise and reapprove the spec before implementation instead. |
| F7 | major | Service-backed provider profiles discard approved account metadata: the header bio is the first service description because the later account pass skips any existing display-name key. This fails the provider-header part of D3/AC3. | `lib/provider-services.ts:76-92`; rendered at `components/browse/provider-profile.tsx:63-75` | Join the approved account onto every grouped provider and use its bio/profile metadata; keep service location/coverage only where the spec calls for service-derived data. Add a focused account-bio precedence test. |

### Resolved round-1 findings

- F1 resolved: Category and Price state, labelled selects, combined filtering, reset, and service-less exclusion are restored.
- F2 resolved: Recommended and both starting-price sorts are restored; ratings remain display-only.
- F3 resolved: plan revision 2 maps D9/AC12 and records the fix-round scope.

### Scope check

- Shared Service Ratings changes remain layered in `services-browser.tsx`, `provider-card.tsx`, `provider-profile.tsx`, `lib/server/data-service.ts`, and `package.json`; the focused ratings suite still passes.
- The working tree contains many unrelated changes outside the exact review scope; none were modified by this review.
- Manual responsive, keyboard, filter/reset, add-service, valid/service-less/unknown/unapproved profile, and card-navigation checks remain unverified.
- Expert skill applied: `supabase` for the public/private snapshot and approval boundary. The current Supabase breaking-change index had no change relevant to this server-side JSON-record flow; no database, migration, or external operation was run.
