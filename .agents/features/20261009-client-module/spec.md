---
artifact: spec
schema: 1
feature: 20261009-client-module
revision: 5
status: spec-approved
risk: high-risk
---

# Client module

- Feature id: 20261009-client-module
- Revision: 5
- Status: spec-approved
- Risk lane: high-risk
- Approved by: user, 2026-10-09
- Related decisions: .agents/decisions/0001-clerk-auth-profiles-roles.md (proposed), .agents/decisions/0002-bookings-relational-source.md (proposed)
- Depends on: .agents/features/20261009-role-based-access/spec.md (route protection, `getCurrentProfile`), .agents/features/20261009-booking-schedule/spec.md (booking tables, status flow, availability)

## Problem

Clients need a dedicated area under `/client` to find approved providers, compare packages, book with event details, pay a downpayment or in full, track bookings, request changes, and leave feedback. Much of this exists inside one tabbed component and the public browse pages, but rescheduling, cancellation requests, client-initiated refund requests, full payment, and package comparison are missing.

Facts found in the code:

- `app/client/page.tsx` renders `components/dashboard/client-dashboard.tsx` (tabs: Overview, My bookings, Messages, Reports, Payments, Refunds, Feedback, My profile).
- Browsing is public: `app/browse/page.tsx` (`components/browse/services-browser.tsx`) and `app/services/[id]`. Booking uses `components/booking/booking-flow.tsx` with `components/booking/booking-date-picker.tsx` (availability via `isUnavailable`).
- Bookings are JSON arrays in `soundstage.records`, keyed `soundstage-client-bookings-v3:<email>` (`lib/server/domain/client-bookings.ts:6`). Provider and admin screens read the same records. `Booking` type is in `lib/mock-data.ts`.
- Payment is a fixed 30% downpayment (`components/booking/booking-flow.tsx:66`); PayMongo lives in `lib/server/paymongo.ts`, `app/api/paymongo/webhook/route.ts`, `app/payment/return/page.tsx`.
- Clients cancel instantly; only `Cancelled` is allowed for clients (`client-bookings.ts:53`). No reschedule support exists anywhere.
- Refunds are allowed only for paid bookings cancelled by the provider (`client-bookings.ts:92`); admins review them with `reviewBookingRefund` (`client-bookings.ts:101`).
- Feedback is limited to Completed bookings, once each, rating 1-5, comment up to 2,000 characters (`client-bookings.ts:74-86`).
- `getClientBookings` returns all bookings when the caller is not a client (`client-bookings.ts:29-33`).
- Provider applications carry `status: "Pending" | "Approved" | "Rejected"` (`lib/server/domain/client-auth.ts:4`).
- There is no `src/` folder; components live in root `components/` with the `@/components` alias.

## Decisions

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | Risk lane | High-risk. | Payments, refunds, booking state. |
| D2 | Data approach | Bookings, requests, and availability use the booking-schedule module's tables and functions. Provider and package data are read from the existing store. | Revised in rev 2 to follow the booking-schedule feature (ADR 0002). |
| D3 | Component location | `components/client/` (not `src/components/client`). | Matches repository layout and import alias. |
| D4 | Page structure | `/client` (overview), `/client/providers`, `/client/providers/[id]`, `/client/compare`, `/client/book/[serviceId]`, `/client/bookings`, `/client/bookings/[id]`. Existing tab content (payments, refunds, feedback, profile) moves into reusable components. Public `/browse` and `/services` stay unchanged. (`/browse` superseded by 20261014-provider-browse.) | Linkable pages; requested structure. |
| D5 | Package comparison | Select up to 3 packages; compare price, inclusions, duration, coverage area, provider rating side by side. | Enough to decide without clutter. |
| D6 | Rescheduling | Client submits a request (new date, time, reason) on an `accepted`, `awaiting_payment`, or `confirmed` booking; booking shows "Reschedule requested". Provider response is handled by the provider module. | Direct changes could double-book a provider. |
| D7 | Cancellation | Unpaid `pending`, `accepted`, or `awaiting_payment` bookings cancel instantly; paid `confirmed` bookings create a cancellation request. Provider response is handled by the provider module. | Protects paid money without slowing unpaid cancellations. |
| D8 | Refunds | A paid `cancelled` booking (provider-cancelled or approved cancellation request) allows a refund request through the refund module with amount (up to refundable), reason, supporting details, up to 3 attachments, and payout method and account; the client can withdraw it while `requested` and sees its history. The payroll master decides. | Revised in rev 4: refund module. |
| D9 | Payment amount and timing | Payment happens after the provider accepts, while the booking is `awaiting_payment` (48h hold). The client chooses 30% downpayment or full amount through the existing PayMongo flow; remaining balance can be paid later from the booking page. | Revised in rev 2: booking-schedule flow takes payment after acceptance. |
| D10 | Visible providers | Only providers whose application is Approved, and only their published, non-deactivated packages. | Requirement; matches provider module rules. |
| D11 | Feedback | Through the feedback module: only the booking's client, booking `completed`, one review per booking, no editing. | Revised in rev 5: feedback module. |
| D12 | Current user | From Clerk via `getCurrentProfile` (role-based-access feature). | Single identity source. |

## Out of scope

- Provider, payroll master, and admin pages: separate modules.
- Provider approval of reschedule and cancellation requests: provider module (20261009-provider-module).
- Changes to public `/browse` and `/services` pages (D4).
- Automatic refunds or refund policy percentages: payroll master decides (D8).
- Messages and Reports tabs: not in the requested list; they stay available as they are today but are not redesigned.

## Acceptance criteria

Access and data boundaries

- AC1: THE SYSTEM SHALL serve every `/client` page only to signed-in users whose profile role is `client`, using the role-based-access helpers.
- AC2: THE SYSTEM SHALL return to a client only bookings stored under that client's own key; IF the caller is not a client, THEN client booking functions SHALL return no bookings rather than all bookings.
- AC3: IF a client requests a booking id that is not theirs at `/client/bookings/[id]`, THEN THE SYSTEM SHALL show "Booking not found" and reveal no booking data.

Providers and packages

- AC4: WHEN a client opens `/client/providers`, THE SYSTEM SHALL list only providers with application status Approved.
- AC5: WHEN a client opens `/client/providers/[id]`, THE SYSTEM SHALL show the provider's profile and only their published, non-deactivated packages; IF the provider is not Approved, THEN THE SYSTEM SHALL show "Provider not found".
- AC6: WHEN a client selects packages to compare, THE SYSTEM SHALL show up to 3 side by side with price, inclusions, duration, coverage area, and provider rating; IF a fourth is selected, THEN THE SYSTEM SHALL keep 3 and explain the limit.

Booking

- AC7: WHEN a client opens `/client/book/[serviceId]`, THE SYSTEM SHALL require event date, start time, location, and event details, and SHALL block dates the shared availability logic marks unavailable.
- AC8: IF required booking fields are missing or invalid (past date, unavailable date, empty location, details over the length limit), THEN THE SYSTEM SHALL show a field-level error and not create a booking.
- AC9: WHEN a valid booking request is submitted, THE SYSTEM SHALL create exactly one `pending` booking through the booking module with the package name, inclusions, and price snapshot, even if the submit action is repeated.
- AC10: IF the package is deactivated or the provider is no longer Approved at submit time, THEN THE SYSTEM SHALL reject the booking with a clear message.

Payment

- AC11: WHILE a booking is `awaiting_payment`, THE SYSTEM SHALL show the payment deadline and offer "30% downpayment" or "Full payment" through the existing PayMongo flow; WHILE a booking is `pending`, THE SYSTEM SHALL not offer payment.
- AC12: WHEN a partially paid `confirmed` booking is opened, THE SYSTEM SHALL show the remaining balance and a "Pay balance" action using the same flow.
- AC13: THE SYSTEM SHALL show a booking as `confirmed` only after the booking module records verified PayMongo payment, never from the client redirect alone.
- AC14: IF payment fails or is abandoned, THEN THE SYSTEM SHALL keep the booking's payment state unchanged and let the client retry.

Status and requests

- AC15: WHEN a client opens `/client/bookings`, THE SYSTEM SHALL list their bookings with status, event date, provider, amount paid, and balance; `/client/bookings/[id]` SHALL show a status timeline from `booking_status_history`.
- AC16: WHEN a client submits a reschedule request with a new date, time, and reason on an `accepted`, `awaiting_payment`, or `confirmed` booking, THE SYSTEM SHALL record it and show "Reschedule requested"; IF one is already pending, THEN THE SYSTEM SHALL reject a second.
- AC17: WHEN a client cancels an unpaid `pending`, `accepted`, or `awaiting_payment` booking, THE SYSTEM SHALL cancel it immediately after an in-app confirmation.
- AC18: WHEN a client cancels a paid `confirmed` booking, THE SYSTEM SHALL create a cancellation request instead of cancelling, and show "Cancellation requested".
- AC19: WHEN a booking is refund-eligible under the refund module, THE SYSTEM SHALL offer a refund request form (amount defaulting to the refundable amount, reason, details, attachments, payout method and account), show the request's status and history afterwards, and offer "Withdraw" while it is `requested`; otherwise the refund action SHALL not be offered.
- AC20: IF a client attempts any status change other than cancel or the requests above, THEN THE SYSTEM SHALL reject it.

Feedback

- AC21: WHEN a booking is `completed` and has no feedback, THE SYSTEM SHALL offer a feedback form (1-5 rating, comment up to 2,000 characters) that submits through the feedback module; otherwise the form SHALL not be offered, and submitted feedback SHALL be shown read-only.

## Non-functional and operational checks

| Area | Requirement or `not applicable` with reason | Evidence |
| --- | --- | --- |
| Security | All mutations verified server-side for ownership and state; payment status only from PayMongo confirmation; no other client's data reachable. | Unit tests on domain functions; review of server actions. |
| Privacy | Clients see provider public profile only; no provider documents or payout details. | Review of rendered fields. |
| Accessibility | Forms labelled, errors announced, dialogs keyboard operable, comparison table readable by screen readers. | Manual keyboard check. |
| Performance | Provider and package lists render without loading every booking into the browser. | Code review. |
| Observability | Booking, payment, reschedule, cancellation, and refund actions recorded via existing `recordMarketplaceAction`. | Audit entries in tests. |
| Rollback | Booking data rollback is owned by the booking-schedule feature; this module adds no schema of its own. | Diff review. |

## Follow-ups

- Refund policy (percentages, deadlines) once the business defines it.

## Change log

- 2026-10-09: revision 1 approved by the user.
- 2026-10-09: revision 2; changed D2, D6-D9, AC9, AC11-AC13, AC15-AC19, AC21; affected plans none (not yet planned); reason: user approved the booking-schedule module (relational tables, payment after acceptance).
- 2026-10-09: revision 3; changed D8, Out of scope; affected plans none (not yet planned); reason: user approved the payroll-master module (payroll master owns refund and payout decisions, ADR 0004).
- 2026-10-09: revision 4; changed D8, AC19; affected plans none (not yet planned); reason: user approved the refund module (20261009-refund-module).
- 2026-10-09: revision 5; changed D11, AC21; affected plans none (not yet planned); reason: user approved the feedback module (20261009-feedback-module).
