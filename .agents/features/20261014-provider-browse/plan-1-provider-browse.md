---
artifact: plan
schema: 1
feature: 20261014-provider-browse
revision: 2
status: plan-approved
risk: standard
---

# Plan 1: Provider-first browse, provider page, service category

- Feature: `.agents/features/20261014-provider-browse/spec.md`
- Design: none
- Implements decisions: D1, D2, D3, D4, D5, D6, D7, D8, D9
- Spec revision: 2
- Depends on: none; this plan must pass review before `20261014-service-ratings` resumes because both features change `components/browse/services-browser.tsx`
- Status: plan-approved
- Estimate: whole plan about 350 lines of diff; remaining review-fix round about 80 lines; split point: after Phase 1 if the whole-plan diff grows past 400 lines

## Goal

Services carry a validated category. `/browse` lists every approved provider,
including approved providers without active services, and provides always-visible
Category and Price dropdowns, search, and the three approved sort choices.
`/providers/[id]` shows the provider and all active services.

This revision revalidates the original revision-1 plan against spec revision 2.
It adds D9/AC12 traceability and incorporates Provider Browse review round 1.
The current implementation already covers most phases; the next implementation
run is a fix round limited to review findings F1 and F2. This planning revision
resolves review finding F3 once the user approves it.

## Evidence (checked in the repository)

- `lib/provider-services.ts:49-50`: `serviceCategory` defaults a missing category to `Full Production`.
- `lib/provider-services.ts:72-94`: active services are grouped by provider and `getPublicProviders` adds approved providers without services after service-backed providers.
- `lib/server/data-service.ts:77-82`: `serviceInput` validates category against the four allowed values and defaults invalid or missing input to `Full Production`.
- `components/hubs/hub-workspace.tsx:187-203,227`: the add-service flow stores a required category selected from the four categories.
- `components/browse/services-browser.tsx:12-72`: the shared browse UI currently has rating-only sorting and no Category or Price state; this is the source of review findings F1 and F2.
- `components/browse/services-browser.tsx:75-94`: provider rating display and the two empty states already exist and must be preserved.
- `components/browse/provider-card.tsx:10-54`: each provider is a link and shows rating, location, service count, starting price, or `No services yet`.
- `components/browse/provider-profile.tsx:28-38,50-114`: the profile resolves only public providers, handles not-found and service-less states, and renders active services.
- `app/providers/[id]/page.tsx:10-19`: the public provider route renders the profile within the site shell.
- `tests/provider-browse.cjs:12-53`: focused tests cover category fallback, active-service grouping, slugs, the server category whitelist, and approved providers without services.
- `.agents/features/20261009-client-module/spec.md:44`: D4 records that this feature supersedes the earlier `/browse` constraint.
- `.agents/features/20261014-service-ratings/spec.md:12,49`: Service Ratings declares this plan's review pass as a dependency because the features share the browse component.
- `.agents/features/20261014-provider-browse/review-1-provider-browse.md`: round 1 requests restoration of Category/Price filtering and Recommended/price sorting, plus this revision-2 plan revalidation.
- `package.json:9,17-18`: lint, full test, and typecheck scripts exist; review round 1 found lint currently not runnable because ESLint is not installed/resolvable.

## Phases

### Phase 1: Service category (D4)

- Keep `category?: ServiceCategory` on the client and server `ProviderService` types so old stored services remain readable.
- Keep `serviceCategory(service)` as the single read fallback to `Full Production`.
- Keep server-side category allowlisting in `serviceInput`; missing or invalid values become `Full Production`.
- Keep the required four-option Category select in the provider add-service form.

### Phase 2: Provider grouping and browse helpers (D2, D5, D7, D9)

- Keep stable provider ids from `providerSlug(name) = encodeURIComponent(name.trim())` and active-service grouping in `groupProviders`.
- Keep approved account-only providers in `getPublicProviders` with `services: []` and `minPrice: Infinity`, after providers that have active services.
- Add minimal pure browse helpers in `lib/provider-services.ts` so focused tests can verify search, combined Category/Price matching, approved sorting, and service-less-provider placement without rendering the client component.
- Search must be case-insensitive over provider name, location, and service names.
- A provider with services matches Category and Price only when one active service satisfies both selections. An account-only provider matches only while Category is `All` and Price is `Any price`.
- Recommended preserves grouping/insertion order. Lowest and Highest starting price order priced providers by `minPrice`; service-less providers remain last in both directions.

### Phase 3: Restore the approved browse UI and preserve ratings (D2, D5, D6, D7, D9; review F1-F2)

- In `components/browse/services-browser.tsx`, restore state for Category (`All` plus the four categories), Price (the existing four bands), and sort (`Recommended`, `Price: low to high`, `Price: high to low`).
- Render labelled native Category and Price selects beside the search input at all viewport sizes. Keep search and sort keyboard-accessible.
- Apply search and the combined Category/Price predicate before sorting. Use the approved price-band boundaries: under PHP 15,000; PHP 15,000 through PHP 30,000; over PHP 30,000.
- Reset search, Category, Price, and sort to their defaults from the Clear filters action.
- Keep Service Ratings integration limited to loading ratings and passing `providerSummary` to `ProviderCard`; do not offer rating sorting unless the Provider Browse spec changes.
- Preserve `No providers yet` when the public provider list is empty and `No providers match your filters` plus Clear filters when filters remove all results.
- Keep `app/browse/page.tsx` provider-focused copy.

### Phase 4: Provider page and service-less state (D3, D9)

- Keep `app/providers/[id]/page.tsx` and `components/browse/provider-profile.tsx` resolving from `getPublicProviders` and listening for `soundstage-services-updated`.
- Keep the provider header with name, location, coverage areas, and bio when present.
- Render every active service through `PackageCard`/`toServicePackage`, preserving existing service-detail routing and real categories.
- Unknown or unapproved ids show the provider-not-found state with a link to `/browse`.
- Approved providers without active services show their profile with `No services yet`.

### Phase 5: Supersession note (D8)

- Keep the one-line client-module D4 note that `/browse` is superseded by `20261014-provider-browse`.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T1.1 Category compatibility and validation | none | `lib/provider-services.ts`, `lib/server/domain/provider-services.ts`, `lib/server/data-service.ts`, `components/hubs/hub-workspace.tsx` | AC9, AC10 | `tests/provider-browse.cjs` category fallback and server whitelist; manual required-select check |
| T1.2 Provider grouping and pure browse helpers | T1.1 | `lib/provider-services.ts` | supporting behavior for T1.3-T1.5 | focused grouping, search, combined-filter, boundary, and sort tests |
| T1.3 Provider browse UI | T1.2 | `components/browse/services-browser.tsx`, `components/browse/provider-card.tsx`, `app/browse/page.tsx` | AC1, AC2, AC5, AC6, AC7, AC8, AC11 | focused helper tests plus manual browse, keyboard, filter, sort, link, reset, and empty-state checks |
| T1.4 Public provider profile | T1.2 | `app/providers/[id]/page.tsx`, `components/browse/provider-profile.tsx` | AC3, AC4 | manual valid, unknown, and unapproved provider checks |
| T1.5 Providers without services | T1.2 | grouping helpers, browse UI, provider card/profile | AC12 | focused account-only grouping/filter/sort tests plus manual browse and profile empty-state checks |
| T1.6 Supersession note | none | `.agents/features/20261009-client-module/spec.md` | none (D8 consistency) | diff inspection |

## Tests

- Keep the existing category fallback, category whitelist, active grouping, slug, and account-only provider cases in `tests/provider-browse.cjs`.
- Add focused cases proving one service must satisfy Category and Price together; a match split across two services must not pass.
- Add price-boundary cases for under PHP 15,000, PHP 15,000-30,000 inclusive, and over PHP 30,000.
- Add case-insensitive search cases for provider name, location, and service name.
- Add all three sort cases, including service-less providers staying last for both price directions and Recommended preserving input order.
- Add account-only cases proving Category or Price filtering excludes providers without services while the default filters include them.
- Keep the Service Ratings focused suite passing because the shared browse component must retain rating display wiring.

## Out of scope

- Package-card view or Providers/Packages toggle on `/browse`.
- Modal provider view.
- New categories or price bands.
- Ratings/reviews as a Provider Browse feature; existing Service Ratings display wiring may remain, but rating sorting is not added here.
- Changes to `/services/[id]`, `/listed-services/[id]`, or the booking flow.
- Changing the category of existing services; no edit form exists, and old services read as Full Production.

## Acceptance

- Spec: AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, AC12.
- Technical: no migration or external operation; missing category reads as Full Production; only approved providers and their active services are public; the Service Ratings display remains intact while rating sorting remains excluded.

## Verification

- Routine local checks: `npm.cmd run typecheck`; `node --test tests/provider-browse.cjs`; `node --test tests/service-ratings.cjs`; `npm.cmd test`; `npm.cmd run lint` (record the known missing/unresolvable ESLint result if unchanged).
- SDD validation: `pwsh -NoProfile -File scripts/sdd-doctor.ps1 -Path .` and record any repository-wide pre-existing failures separately.
- Scoped operations: none.
- Manual: as an approved provider add a Lighting service at PHP 10,000; on `/browse` confirm the provider card and starting price; verify Category=Lighting plus Price=Under PHP 15,000 keeps it and Category=Sound System hides it; search by provider, location, and service name; try all three sorts; clear filters; click the card; verify valid, service-less, unknown, and unapproved provider pages; tab through search, dropdowns, sort, Clear filters, and cards.

## Expert skills to apply

- none; `prompt-master` is used only to update this plan's workflow handoff prompts.

## Risks and stop points

- `components/browse/services-browser.tsx` is shared with the changes-requested Service Ratings feature. Complete and review this Provider Browse fix first; do not resume Service Ratings fixes in the same implementation run.
- Preserve rating loading and provider rating display already present in the shared file, but do not preserve its out-of-spec rating sort.
- `PackageCard` routes stored provider services through the existing listed-service detail route. Do not change service-detail routing in this plan; stop and ask if review requires a route contract change.
- The working tree contains unrelated changes. Before implementation, run `git status` and stop if any required file has new changes not accounted for by the two feature reports and reviews.
