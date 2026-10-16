---
artifact: implementation
schema: 1
feature: 20261014-service-ratings
plan: plan-1-service-ratings.md
spec-revision: 2
status: ready-for-review
---

# Implementation 1: Service ratings

## Gate note

The plan's dependency (20261014-provider-browse review pass) was NOT met. The user
explicitly chose to build anyway on 2026-10-14. `components/browse/provider-card.tsx`,
`provider-profile.tsx`, `services-browser.tsx`, `lib/server/data-service.ts` and
`package.json` already held unreviewed provider-browse changes; this work is layered
on top, so the two diffs are mixed in those files.

## Files changed

- `lib/service-ratings.ts` (new): pure `reviewerName`, `buildServiceRatings`, `summarize`, `providerSummary`, `SERVICE_RATINGS_KEY`.
- `lib/service-ratings-store.ts` (new): `getServiceRatings()` reading `appStorage`.
- `lib/server/data-service.ts`: `publicServiceRatings()`; `visibleRecords()` adds `soundstage-service-ratings-v1` for every visitor (admin included).
- `components/site/package-card.tsx`: optional `rating` prop renders stars or "No reviews yet".
- `components/browse/provider-card.tsx`: required `rating` prop; stars under the name.
- `components/browse/services-browser.tsx`: loads ratings, passes `providerSummary` to each card.
- `components/browse/provider-profile.tsx`: loads ratings, passes per-service `summarize` to each `PackageCard`.
- `components/site/service-reviews.tsx` (new): Reviews section, newest first.
- `app/services/[id]/page.tsx`, `components/site/provider-service-detail.tsx`: render `ServiceReviews`.
- `tests/service-ratings.cjs` (new); added to `package.json` test script.

## Deviations from plan

1. `getServiceRatings()` lives in `lib/service-ratings-store.ts`, not `lib/service-ratings.ts`: `lib/app-store.ts` imports the Supabase client, and the server (`data-service.ts`) must import only the pure functions.
2. No new `components/site/star-rating.tsx`: an unused `StarRating({ rating, reviews })` already existed at HEAD (with an sr-only label). It was briefly overwritten by mistake, then restored with `git checkout` and reused unchanged. "No reviews yet" is rendered by callers.

## Acceptance evidence

| AC | Evidence |
| --- | --- |
| AC1 | `tests/service-ratings.cjs` "averages and counts..." pass (4.5 from 5+4; ignores non-Completed, missing, rating 6) |
| AC2 | code: `provider-profile.tsx` passes `rating` to `PackageCard`; manual not done |
| AC3 | code: `package-card.tsx`, `provider-card.tsx`, `service-reviews.tsx` "No reviews yet"; manual not done |
| AC3a | test "combines a provider's services" pass; `services-browser.tsx` wiring; manual not done |
| AC4 | test "reviews are newest first" pass; both detail pages render `ServiceReviews`; manual not done |
| AC5 | existing `StarRating` sr-only "Rated X out of 5 from N reviews"; manual screen-reader check not done |
| AC6 | test "public reviews expose only..." pass (keys = comment, createdAt, rating, reviewer; email -> "Client"); server sends only `buildServiceRatings` output |

## Checks run (this session)

- `node --test tests/service-ratings.cjs`: 4/4 pass.
- `npm run typecheck`: pass (no output).
- `npm test`: 108 tests, 107 pass, 1 fail (`tests/system-activity.cjs`, reported failing on HEAD in impl-1-provider-browse).
- `npx eslint ...`: not runnable (no flat config; ESLint migration-guide error).

## Not verified

- Manual UI on `/browse`, `/providers/[id]`, `/services/[id]`, `/listed-services/[id]`, dark mode, screen reader.
- That the new record reaches signed-out visitors end-to-end in a running app.
