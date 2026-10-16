---
artifact: impl
schema: 1
feature: 20261014-provider-browse
plan: 1
status: ready-for-review
---

# Implementation 1: Provider-first browse

- Plan: `plan-1-provider-browse.md` (revalidated for spec revision 2)
- Scope: whole plan (T1.1-T1.6), followed by review round 1 fixes F1-F2
- Pre-existing changes: user confirmed on 2026-10-14 that uncommitted changes in `components/hubs/hub-workspace.tsx` and `lib/server/data-service.ts` are theirs; built on top.

## Files

- `lib/provider-services.ts`: `category?` on `ProviderService`; helpers `serviceCategory`, `providerSlug`, `groupProviders` (+ `ProviderProfile` type), `toServicePackage`.
- `lib/server/domain/provider-services.ts`: `category?` on the server type.
- `lib/server/data-service.ts`: `serviceCategories` whitelist; `serviceInput` stores `category` or `"Full Production"`.
- `components/hubs/hub-workspace.tsx`: required Category `<select>` in the add-service form; `addService` sets `category`.
- `components/browse/services-browser.tsx`: rewritten to show provider cards; Category/Price/Sort selects; search over provider name, location, service names; empty states.
- `components/browse/provider-card.tsx` (new), `components/browse/provider-profile.tsx` (new), `app/providers/[id]/page.tsx` (new).
- `app/browse/page.tsx`: copy says providers; drops "location" from filter sentence.
- `.agents/features/20261009-client-module/spec.md`: D4 note (D8).
- `tests/provider-browse.cjs` (new) and added to `npm test` in `package.json`.

## Deviations

- Service mapping moved from `services-browser.tsx` into `toServicePackage` in `lib/provider-services.ts` so the provider page can reuse it (plan said "same mapping").
- Server whitelist test is a source-text assertion: `serviceInput` needs an authenticated runtime and is not exported.
- The location filter (hidden chips) was removed along with the other chips; it was already invisible (`FilterGroup` rendered `hidden`).
- Plan risk "business rename splits slugs": checked; `updateProfile` (`data-service.ts:93-97`) rewrites `providerName` on own services, so no action.

## Checks (run in this session)

- `npm run typecheck`: pass (no output).
- `node --test tests/provider-browse.cjs`: 4/4 pass.
- `npm test`: 103/104 pass; 1 fail `tests/system-activity.cjs:19`. Pre-existing: fails identically on HEAD `bcbd0dd` in a clean worktree. Not touched.
- `npm run lint` / `npx eslint`: not runnable; ESLint 10 finds no `eslint.config.*` (pre-existing project config gap).

## Manual checks

- Not done: browser walkthrough from the plan's Verification section (add Lighting service, filters, sorts, provider page, bad id, keyboard). Reviewer or user must do it.

## Unrelated problems noticed

- `tests/system-activity.cjs` failing on HEAD.
- No ESLint flat config, so `npm run lint` fails.

## Revision 2 fix (spec rev 2, D9/AC1/AC4/AC12), 2026-10-14

- `lib/client-auth.ts`: `getApprovedProviders()` (approved provider profiles already sent publicly by `visibleRecords`).
- `lib/provider-services.ts`: `groupProviders(services, accounts = [])` adds approved providers with no active services (`services: []`, `minPrice: Infinity`); `providerDisplayName`, `getPublicProviders()`.
- `services-browser.tsx`: uses `getPublicProviders`; providers without services shown only when no category/price filter is set; sorted last for both price sorts.
- `provider-card.tsx` / `provider-profile.tsx`: "No services yet" states; location/coverage hidden when empty; not-found copy updated.
- `tests/provider-browse.cjs`: new test for service-less providers.
- Checks: `npm run typecheck` pass; `node --test tests/provider-browse.cjs` 5/5 pass. Manual browser check not done.

## Fix round 1 (review F1-F2), 2026-10-15

### Changes

- `lib/provider-services.ts`: added pure provider search, combined Category/Price
  filtering, and Recommended/price sorting helpers. One active service must match
  both filters; providers without services remain visible only under default
  filters and sort after priced providers in either price direction.
- `components/browse/services-browser.tsx`: restored always-visible labelled
  Category and Price selects plus Recommended/low/high price sorts; Clear filters
  now resets all four controls. Service Ratings loading and provider summary
  display remain intact, with ratings excluded from sorting.
- `tests/provider-browse.cjs`: added regression cases for same-service matching,
  all price boundaries, case-insensitive search fields, service-less filtering,
  and all three approved sorts.

### Deviations

- None. The fix is limited to review findings F1 and F2. Service Ratings review
  finding F3 is intentionally left to that feature's own fix round.
- Expert skills: none. This fix changes pure client-side browse logic and tests;
  it does not change Supabase, PostgreSQL, authentication, or the public data
  boundary reviewed in round 1.

### Checks (run in this session)

- `git diff --check -- lib/provider-services.ts components/browse/services-browser.tsx tests/provider-browse.cjs`: pass.
- `node --test tests/provider-browse.cjs`: pass, 10/10.
- `node --test tests/service-ratings.cjs`: pass, 4/4.
- `npm.cmd run typecheck`: pass.
- `npm.cmd test`: 113/114 pass. The sole failure remains
  `tests/system-activity.cjs:19`, where the existing refund activity link differs
  from the test expectation; both the prior implementation and review recorded
  the same unrelated failure.
- `npm.cmd run lint`: did not run because `eslint` is not installed/resolvable.
- `pwsh -NoProfile -File scripts/sdd-doctor.ps1 -Path .`: did not start because
  PowerShell 7 is unavailable. The installed Windows PowerShell host ran the
  same script and reported 214 repository-wide failures plus one warning,
  including placeholder `project.md` content, other features' incomplete or
  duplicate AC mappings, stale artifacts, missing skill mirrors, and an
  unverified Git baseline. It reported no Provider Browse traceability failure.

### Manual checks

- Not done: the browser walkthrough for responsive layout, add-service category,
  filter/sort/reset behavior, valid/service-less/unknown/unapproved profiles,
  provider-card navigation, and keyboard operation.
