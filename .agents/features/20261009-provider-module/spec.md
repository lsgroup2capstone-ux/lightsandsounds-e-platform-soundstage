---
artifact: spec
schema: 1
feature: 20261009-provider-module
revision: 5
status: spec-approved
risk: high-risk
---

# Service provider module

- Feature id: 20261009-provider-module
- Revision: 5
- Status: spec-approved
- Risk lane: high-risk
- Approved by: user, 2026-10-09
- Related decisions: .agents/decisions/0001-clerk-auth-profiles-roles.md (proposed), .agents/decisions/0002-bookings-relational-source.md (proposed), .agents/decisions/0004-financial-records-and-audit.md (proposed)
- Depends on: .agents/features/20261009-role-based-access/spec.md, .agents/features/20261009-booking-schedule/spec.md

## Problem

Providers need a dedicated area under `/provider` to manage their business profile, documents, portfolio, packages, service areas, availability, bookings, money, subscription, and feedback. Today the provider area is a section of a component shared with admin, packages lack inclusions and a publish lifecycle, there are no availability schedules, and no file storage beyond in-browser reads at signup.

Facts found in the code:

- `app/provider/[[...slug]]/page.tsx` and `app/admin/[[...slug]]/page.tsx` both render `components/hubs/hub-workspace.tsx` (368 lines); its role redirect is client-side (`hub-workspace.tsx:349`).
- `ProviderService` (`lib/server/domain/provider-services.ts:5-17`) has name, location, coverageAreas, transportationFee, description, price, image, providerName, active, bookings. No inclusions or draft/published state. Stored as JSON under `soundstage-provider-services-v2:<email>` (`provider-services.ts:19`).
- Approval: `isProviderApproved` and application `status: "Pending" | "Approved" | "Rejected"` (`lib/server/domain/client-auth.ts:4`).
- Subscription: `ensureProviderTrial`, `getProviderSubscription`, `subscriptionStatus`, `submitSubscriptionPayment`, `reviewSubscriptionPayment` (`lib/server/domain/marketplace-billing.ts`); UI in `components/payment/subscription-panel.tsx`.
- Withdrawals: `getWithdrawalRequests`, `createWithdrawalRequest`, `updateWithdrawalStatus` (`lib/withdrawals.ts`). Coverage areas: `lib/coverage-areas.ts`.
- Cloudflare R2 is not used anywhere. Signup documents are read in the browser (`components/auth/signup-form.tsx:64`, `readProviderDocuments` in `lib/client-auth.ts`).
- No availability schedule exists; the booking-schedule feature adds `availability_schedules`.
- There is no `src/` folder; components live in root `components/`.

## Decisions

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | Risk lane | High-risk. | Uploads, payouts, booking state. |
| D2 | Data approach | Bookings, availability, and requests use the booking-schedule tables. Provider profile, packages, and portfolio stay in the existing records store with extended models. | Booking module owns booking data (ADR 0002); other provider data migration is not requested. |
| D3 | Component location | `components/provider/`. | No `src/` folder. |
| D4 | Pages | `/provider` (overview), `/provider/profile`, `/provider/documents`, `/provider/portfolio`, `/provider/packages`, `/provider/packages/new`, `/provider/packages/[id]`, `/provider/service-areas`, `/provider/availability`, `/provider/bookings`, `/provider/bookings/[id]`, `/provider/payments`, `/provider/subscription`, `/provider/feedback`. They replace the provider section of `HubWorkspace`; admin's use of `HubWorkspace` is unchanged. | Requested structure; admin module untouched. |
| D5 | Uploads | Cloudflare R2 private bucket. Server issues short-lived presigned upload URLs; files display through short-lived signed URLs. Documents: PDF/JPG/PNG ≤ 10 MB. Portfolio: JPG/PNG/WebP ≤ 5 MB, max 20 images. New dependency `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` and R2 env vars (approved). | Files bypass the server; bucket never public. |
| D6 | Documents after approval | Stored and listed; they do not change approval status. | Admin module untouched; re-review is a follow-up. |
| D7 | Package lifecycle | Draft, Published, Deactivated, Removed by admin. Anyone may save drafts; only approved providers with an active subscription may publish. Deactivated and removed packages are hidden from clients; existing bookings on them continue. A removed package shows the admin's reason and can be edited and republished, which returns it to admin review. While the provider account is suspended, all their packages are hidden. | Requirement "only approved providers may publish". |
| D8 | Price and inclusions | Inclusions: list of up to 30 items, each ≤ 200 characters. Price: positive whole pesos. Changes never affect existing bookings (booking snapshot). | Clear limits; snapshot rule from booking module. |
| D9 | Availability | Weekly working days plus blocked dates in `availability_schedules`, applied by the booking module's shared bookable-range function, so the client date picker reflects them without client UI edits. | Requirement without editing the client module. |
| D10 | Booking actions | Accept (`pending → accepted`, then system `→ awaiting_payment`), decline with reason, `confirmed → in_progress → completed` on or after event start, cancel a confirmed booking with reason (refund-eligible). | Booking module transition table. |
| D11 | Requests | Provider approves or declines reschedule requests (re-checked against availability) and client cancellation requests. | Completes client-side flows. |
| D12 | Payments and payouts | Read-only payments received per booking, amounts awaiting payout, and payout records from the provider payout module with per-booking breakdown (gross, fee and rate, refunds, deductions with remarks, net), status, payout date, reference, and history. No withdrawal requests and no payout actions. | Revised in rev 4: provider payout module. |
| D13 | Subscription | Reuse the existing flow unchanged: status, trial, submit payment, history. | No pricing changes requested. |
| D14 | Unapproved providers | Access to profile, documents, portfolio, application status, and draft packages. Bookings and publishing locked with an explanatory banner. | Requirement "only approved providers may publish and receive bookings". |
| D15 | Feedback | Read-only list of feedback from the feedback module for the provider's completed bookings, with average rating. | Revised in rev 5: feedback module. |

## Out of scope

- Client, payroll master, and admin modules.
- Admin re-review of documents uploaded after approval (D6).
- Migrating existing signup documents into R2.
- Subscription pricing changes (D13).
- Migrating provider profile, packages, or portfolio to relational tables.
- Replying to feedback.
- Requesting or deciding payouts: payroll-master feature (D12).

## Acceptance criteria

Access

- AC1: THE SYSTEM SHALL serve every `/provider` page only to signed-in users whose profile role is `provider`, using the role-based-access helpers.
- AC2: WHILE a provider is not Approved, THE SYSTEM SHALL show a banner explaining the locked features and SHALL reject publish and booking actions server-side.
- AC3: THE SYSTEM SHALL scope every provider read and write to the signed-in provider's own data; IF a provider requests another provider's package, booking, or file, THEN THE SYSTEM SHALL respond "Not found".
- AC4: WHEN the provider pages are in place, THE SYSTEM SHALL render the admin hub with the same sections and behavior as before.

Profile, documents, portfolio

- AC5: WHEN a provider saves the business profile with valid fields, THE SYSTEM SHALL persist it; IF fields are invalid, THEN THE SYSTEM SHALL show field-level errors and save nothing.
- AC6: WHEN a provider uploads a file, THE SYSTEM SHALL issue a presigned upload URL only for an allowed type and size and a key under that provider's own prefix, and SHALL record the file only after the upload is confirmed.
- AC7: IF a file exceeds the size limit, has a disallowed type, or the portfolio already has 20 images, THEN THE SYSTEM SHALL refuse before upload with a clear message.
- AC8: THE SYSTEM SHALL keep the R2 bucket private and serve files only through signed URLs that expire.
- AC9: WHEN a provider deletes a document or portfolio image, THE SYSTEM SHALL remove its record and the R2 object.
- AC10: IF R2 is not configured or the upload fails, THEN THE SYSTEM SHALL show a retryable error and record nothing.

Packages

- AC11: WHEN a provider creates or edits a package with name, description, price, inclusions, and coverage areas, THE SYSTEM SHALL validate them per D8 and save it as Draft unless published.
- AC12: WHEN an approved provider with an active subscription publishes a package, THE SYSTEM SHALL make it visible to clients; IF the provider is not approved or the subscription is inactive, THEN THE SYSTEM SHALL reject publishing with the reason.
- AC13: WHEN a provider deactivates a package, THE SYSTEM SHALL hide it from clients and new bookings while existing bookings continue unchanged.
- AC27: WHEN an admin removes a package, THE SYSTEM SHALL show the provider "Removed by admin" with the reason, and WHEN the provider edits and republishes it, THE SYSTEM SHALL publish it and flag it for admin review.
- AC14: WHEN a provider edits a published package's price or inclusions, THE SYSTEM SHALL not change any existing booking's snapshot.

Service areas and availability

- AC15: WHEN a provider saves service areas, THE SYSTEM SHALL accept only areas from `lib/coverage-areas.ts`.
- AC16: WHEN a provider saves weekly working days and blocked dates, THE SYSTEM SHALL store them in `availability_schedules`, and new booking requests on those dates SHALL be rejected by the booking module.
- AC17: IF a provider blocks a date that already has a confirmed booking, THEN THE SYSTEM SHALL save the block and warn that the existing booking is unaffected.

Bookings and requests

- AC18: WHEN a provider opens `/provider/bookings`, THE SYSTEM SHALL list their bookings filterable by status, with pending requests highlighted.
- AC19: WHEN a provider accepts a pending booking, THE SYSTEM SHALL move it through the booking module to `awaiting_payment`; IF the dates are no longer available, THEN THE SYSTEM SHALL refuse with the reason.
- AC20: WHEN a provider declines a booking or cancels a confirmed booking, THE SYSTEM SHALL require a reason and record it in status history.
- AC21: WHEN a provider marks a booking `in_progress` or `completed`, THE SYSTEM SHALL allow it only on or after the event start date.
- AC22: WHEN a provider approves or declines a reschedule or cancellation request, THE SYSTEM SHALL apply the booking module's rules and show the result; IF approval fails availability or overlap checks, THEN nothing SHALL change.
- AC23: THE SYSTEM SHALL not offer a provider any action the booking module's transition table disallows for the current status.

Money, subscription, feedback

- AC24: WHEN a provider opens `/provider/payments`, THE SYSTEM SHALL show verified payments per booking, outstanding client balances, amounts awaiting payout, and their payouts per provider-payouts AC17-AC19; THE SYSTEM SHALL offer no withdrawal request or payout action.
- AC25: WHEN a provider opens `/provider/subscription`, THE SYSTEM SHALL show status, trial end, payment history, and the existing payment submission.
- AC26: WHEN a provider opens `/provider/feedback`, THE SYSTEM SHALL list feedback from the feedback module for their bookings with rating, comment, date, client display name, and average rating, with no edit or delete actions.

## Non-functional and operational checks

| Area | Requirement or `not applicable` with reason | Evidence |
| --- | --- | --- |
| Security | Server-side ownership checks; presigned URLs scoped to provider prefix, type, size, short expiry; R2 credentials server-only; no public bucket. | Unit tests for denial cases; config review; secret scan. |
| Privacy | Documents visible only to the owner provider and admins; clients see only public profile and portfolio. | Review of signed-URL issuance rules. |
| Accessibility | Forms labelled, upload progress and errors announced, keyboard-operable dialogs. | Manual keyboard check. |
| Performance | Images displayed with size limits; lists paginated or bounded. | Code review. |
| Observability | Package publish/deactivate, uploads, deletes, and booking actions recorded via `recordMarketplaceAction` or booking history. | Tests. |
| Rollback | Model extensions are additive; R2 objects can be left orphaned safely; admin hub unchanged. | Diff review. |

## Follow-ups

- Admin re-review of documents uploaded after approval.
- Migrate signup documents into R2.
- Move provider profile and packages to relational tables.

## Change log

- 2026-10-09: revision 1 approved by the user.
- 2026-10-09: revision 2; changed D12, D14, AC2, AC24, Out of scope; affected plans none (not yet planned); reason: user approved the payroll-master module (payroll master owns refund and payout decisions, ADR 0004).
- 2026-10-09: revision 3; changed D7; added AC27; affected plans none (not yet planned); reason: user approved the admin module (20261009-admin-module).
- 2026-10-09: revision 4; changed D12, AC24; affected plans none (not yet planned); reason: user approved the provider payout module (20261009-provider-payouts).
- 2026-10-09: revision 5; changed D15, AC26; affected plans none (not yet planned); reason: user approved the feedback module (20261009-feedback-module).
