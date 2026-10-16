---
artifact: spec
schema: 1
feature: 20261014-service-ratings
revision: 2
status: spec-approved
risk: standard
---

# Service ratings

- Feature id: 20261014-service-ratings
- Revision: 2
- Status: spec-approved
- Risk lane: standard
- Approved by: user, 2026-10-14
- Related: .agents/features/20261009-feedback-module/spec.md, .agents/features/20261014-provider-browse/spec.md
- Depends on: 20261014-provider-browse passing review (shares `components/browse/services-browser.tsx`)

## Problem

Clients browsing services cannot see whether a service is good. Ratings and
feedback exist but are never shown publicly.

Facts found in the code:

- Each `Booking` records the booked service as `packageId` (`lib/mock-data.ts:38`).
- `submitEventFeedback` (`lib/server/domain/client-bookings.ts:74`) stores `booking.feedback = { rating 1-5, comment, createdAt }` on completed bookings.
- Feedback-module spec plans per-provider ratings from a `booking_feedback` table that does not exist yet.

## Decisions

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | Rating scope | Per service (by booking `packageId`). | User request. |
| D2 | Data source | Read existing JSON `booking.feedback` now; switch to `booking_feedback` when the feedback module ships. | Works today; no schema work. |
| D3 | Where shown | Stars + review count on each service card on `/providers/[id]`; full review list on the service detail pages (`/services/[id]` and `/listed-services/[id]`). | User request: feedback below each service. |
| D6 | `/browse` (provider cards since provider-browse) | Each provider card shows the combined rating across that provider's services, e.g. "★ 4.6 (12)". | `/browse` no longer lists service cards. |
| D7 | Public data boundary | The server publishes a sanitized per-service ratings record to every visitor; raw bookings stay private. | Anonymous visitors receive no bookings (`lib/server/data-service.ts:362`). |
| D4 | Reviewer name | First name and last initial only. | Feedback-module privacy rule. |
| D5 | Sequencing | Build after provider-browse review passes. | Same file under review. |

## Out of scope

- New submission UI, editing, moderation, provider replies.
- Provider-level feedback lists (feedback module owns them).

## Acceptance criteria

- AC1: THE SYSTEM SHALL compute, per service, the average rating (one decimal) and count of feedback from completed bookings.
- AC2: WHEN a service has feedback, its card on `/providers/[id]` SHALL show filled stars for the average, the number, and the review count.
- AC3: WHEN a service has no feedback, its card SHALL show "No reviews yet".
- AC3a: Each provider card on `/browse` SHALL show the combined average and total review count of that provider's services, or "No reviews yet".
- AC4: The service detail pages (`/services/[id]`, `/listed-services/[id]`) SHALL list each review below the service: stars, comment, date, reviewer as first name + last initial, newest first.
- AC5: Star displays SHALL have a text label (e.g. "4.5 out of 5 stars").
- AC6: Public views SHALL NOT expose client email, full name, or booking details.

## Non-functional and operational checks

| Area | Requirement | Evidence |
| --- | --- | --- |
| Privacy | AC6 | Review of rendered fields. |
| Accessibility | AC5 | Manual check. |
| Rollback | Read-only display; no data changes. | Diff review. |

## Change log

- 2026-10-14: revision 1 approved by the user (all recommended options).
- 2026-10-14: revision 2 approved by the user: `/browse` provider cards show combined rating (D6, AC3a); detail pages include `/listed-services/[id]`; sanitized public ratings record (D7).
