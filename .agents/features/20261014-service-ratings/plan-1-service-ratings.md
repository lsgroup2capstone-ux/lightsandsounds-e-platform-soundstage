---
artifact: plan
schema: 1
feature: 20261014-service-ratings
revision: 2
status: plan-approved
risk: standard
---

# Plan 1: Service ratings

- Feature: `.agents/features/20261014-service-ratings/spec.md`
- Design: none (read-only display, one additive derived public record)
- Implements decisions: D1, D2, D3, D4, D5, D6, D7
- Spec revision: 2
- Depends on: 20261014-provider-browse review pass (shared browse files)
- Status: plan-approved
- Estimate: about 250 lines of diff; split point: Phase 1 (server + lib + tests) / Phase 2 (UI)

## Goal

Every visitor sees star ratings: combined per provider on `/browse`, per service
on `/providers/[id]`, and a full review list on both service detail pages, built
from existing JSON booking feedback through a sanitized public record.

## Evidence (checked in the repository)

- `lib/mock-data.ts:38`, `:41`, `:64`: `Booking.packageId`, `client` (name string), `feedback?: { rating, comment, createdAt }`.
- `lib/server/domain/client-bookings.ts:74-86`: feedback only on own Completed bookings, rating 1-5.
- `lib/server/data-service.ts:26`: `bookingPrefix = "soundstage-client-bookings-v3:"`.
- `lib/server/data-service.ts:345-377`: `visibleRecords()` builds what each visitor receives; bookings only when signed in (`:362`). Trusted boundary for D7.
- `lib/provider-services.ts:56-80`: `ProviderProfile`, `groupProviders`, `providerSlug`.
- `lib/client-auth.ts:202`: client libs read records via `appStorage.getItem`.
- `components/browse/provider-card.tsx:32`: provider card service-count line.
- `components/browse/provider-profile.tsx:59-61`: service cards rendered with `PackageCard`.
- `components/site/package-card.tsx:12`: shared `PackageCard` (also used for static packages).
- `app/services/[id]/page.tsx:87-103`: static package detail (server component, Separator sections).
- `components/site/provider-service-detail.tsx:24`: provider service detail used by `app/listed-services/[id]/page.tsx`.
- `tests/provider-browse.cjs:1-8`: test style with `tests/ts-loader.cjs`; `package.json:17` test list.

## Phases

### Phase 1: Server record and lib

- `lib/service-ratings.ts` (new):
  - `type PublicReview = { rating: number; comment: string; createdAt: string; reviewer: string }`; `type ServiceRatings = Record<string, PublicReview[]>`.
  - `SERVICE_RATINGS_KEY = "soundstage-service-ratings-v1"`.
  - `reviewerName(full)`: first word + first letter of last word + "." ("Ana Reyes Cruz" -> "Ana C."); one word -> that word; empty or containing "@" -> "Client".
  - `buildServiceRatings(bookings)`: keep `status === "Completed"` with integer `feedback.rating` 1-5; group by `packageId`; newest first; output only the four `PublicReview` fields.
  - `summarize(reviews)` -> `{ average /* 1 decimal */, count }`; `providerSummary(serviceIds, ratings)` combines all reviews of those services.
  - `getServiceRatings()`: safe parse of `appStorage.getItem(SERVICE_RATINGS_KEY)`, `{}` on error.
- `lib/server/data-service.ts` `visibleRecords()`: gather all bookings from `bookingPrefix` keys and set `result[SERVICE_RATINGS_KEY] = JSON.stringify(buildServiceRatings(all))` for every visitor, signed in or not (admin branch included).
- `tests/service-ratings.cjs` (new), appended to the `package.json` test script.

### Phase 2: UI

- `components/site/star-rating.tsx` (new): `StarRating({ value, count, size? })`, five lucide `Star` icons filled to the rounded value, visible number and "(count)", `aria-label="4.5 out of 5 stars"`; `count === 0` renders "No reviews yet".
- `components/site/package-card.tsx`: optional prop `rating?: { average: number; count: number }`; when present render `StarRating` under the name. Existing static usages unchanged.
- `components/browse/provider-profile.tsx`: read `getServiceRatings()`; pass `summarize(ratings[s.id] ?? [])` to each `PackageCard`.
- `components/browse/provider-card.tsx`: show `providerSummary(provider.services.map(s => s.id), ratings)` beside the service count.
- `components/site/service-reviews.tsx` (new, client): `ServiceReviews({ serviceId })` with heading "Reviews", summary `StarRating`, then each review (stars, comment, date via `toLocaleDateString("en-PH")`, reviewer) newest first; empty state "No reviews yet".
- Render `<ServiceReviews serviceId={pkg.id} />` below the inclusions section in `app/services/[id]/page.tsx` and after the provider box in `components/site/provider-service-detail.tsx`.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T1.1 | none | `lib/service-ratings.ts` build/summarize/order | AC1 | `tests/service-ratings.cjs`: averages, counts, newest first, ignores non-Completed and invalid ratings |
| T1.2 | T1.1 | `lib/service-ratings.ts` reviewerName + field whitelist | AC6 | test: only four fields; no email or full surname |
| T1.3 | T1.1 | `lib/server/data-service.ts` `visibleRecords` | D7 boundary | manual or test: signed-out visitor gets ratings key and no booking keys |
| T2.1 | T1.1 | `star-rating.tsx` | AC5 | manual: label read by screen reader |
| T2.2 | T2.1 | `package-card.tsx`, `provider-profile.tsx` | AC2, AC3 | manual on `/providers/[id]` |
| T2.3 | T2.1 | `provider-card.tsx` | AC3a | test for `providerSummary`; manual on `/browse` |
| T2.4 | T2.1 | `service-reviews.tsx`, both detail pages | AC4 | manual on `/services/[id]` and `/listed-services/[id]` |

## Tests

- Build, summarize, provider combine, ordering, reviewer name, field whitelist -> `tests/service-ratings.cjs`.
- Existing suite stays green, including `tests/provider-browse.cjs`.

## Out of scope

- New submission UI, editing, moderation, provider replies.
- Provider-level feedback lists (feedback module owns them).
- Switching to the `booking_feedback` table (when the feedback module ships, D2).

## Acceptance

- Spec: AC1, AC2, AC3, AC3a, AC4, AC5, AC6.
- Technical: read-only; one derived record; no stored data changes. Rollback = revert the diff.

## Verification

- Routine local checks: `npm run typecheck`, `npm test` (pre-existing `system-activity` failure noted in provider-browse), `npm run lint` if runnable.
- Scoped operations: none.
- Manual: as a client, complete a booking and leave feedback; signed out, check the `/browse` card rating, `/providers/[id]` service stars, and the detail-page review list showing "First L." only; a service with no reviews shows "No reviews yet"; check dark mode and the screen-reader label.

## Expert skills to apply

- none applicable beyond project rules (`code-quality.md`, data-boundary section of `security.md`).

## Risks and stop points

- provider-browse still under review and touching the same files -> do not start until its review passes; build on whatever it ends with.
- `Booking.client` may hold an email for some rows -> `reviewerName` never outputs text containing "@".
- Scanning all booking keys per request -> acceptable at current scale; the feedback module replaces it with an indexed table.
