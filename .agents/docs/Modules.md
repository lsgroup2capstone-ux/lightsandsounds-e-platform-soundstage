---
tags:
  - project/modules
updated: 2026-10-15
---

# Modules

Related notes: [[Architecture]] · [[Database]] · [[Dependencies]] · [[Agent-Progress]]

## Client

Primary routes: `/client`, public `/browse`, `/providers/[id]`, `/services/[id]`.

Implemented now:

- Role-protected client layout and role router.
- Tabbed client dashboard for overview, bookings, messages, reports, payments, refunds, feedback, and profile.
- Public provider-first browsing and provider profile pages are present in the working tree; their feature is awaiting review.
- Booking creation, PayMongo checkout, messages, reports, basic refunds, and feedback operate through JSON-backed domain functions.
- Sanitized service ratings are present in the working tree and await review.

Planned or incomplete:

- Dedicated linkable client pages, package comparison, relational booking history, request-based rescheduling/cancellation, and the full refund workflow.
- Payment confirmation and refund behavior backed by planned relational tables.
- Feedback migration to `booking_feedback`.

Feature links: [[Features/20261009-client-module]] · [[Features/20261009-booking-schedule]] · [[Features/20261014-provider-browse]] · [[Features/20261014-service-ratings]]

## Provider

Primary routes: `/provider/*`, public `/providers/[id]`.

Implemented now:

- Role-protected shared hub with application, bookings, messages, reports, schedule, services, subscription, earnings, and settings sections.
- Provider applications and admin review with R2-backed documents.
- Service create/update flows, schedules, booking actions, subscription payments, and legacy withdrawals through JSON records.
- Unapproved-provider server/UI lock passed review and awaits ship authorization.
- R2 upload/view integration through plan 3; real bucket validation and plan 4 cleanup remain.

Planned or incomplete:

- Full provider-specific component split, relational availability and booking request actions, relational payouts, and feedback views.
- Document categories, browser OCR, confirmed-value review, and admin warnings.

Feature links: [[Features/20261009-provider-module]] · [[Features/20261012-r2-file-storage]] · [[Features/20261014-provider-document-categories]] · [[Features/20261009-provider-payouts]]

## Payroll Master

Primary route: `/payroll-master/*`.

Implemented now:

- A server role gate and a dedicated shared-hub section kind/navigation are present in the working tree.
- Payroll Master can currently receive all bookings/reports in filtered API snapshots and resolve provider reports.
- Existing JSON actions allow Payroll Master review of refunds, manual subscription payments, and withdrawals.

Planned or incomplete:

- Most screens are hub placeholders/coming-soon states.
- Relational payment history, two-step refunds, booking-linked payouts, immutable audit log, reports/CSV, and financial data protections are not in the current schema.
- The approved spec removes Admin financial authority, but transitional server actions still permit Admin on some refund/subscription/withdrawal operations.

Feature links: [[Features/20261009-payroll-master]] · [[Features/20261009-paymongo-payments]] · [[Features/20261009-refund-module]] · [[Features/20261009-provider-payouts]]

## Admin

Primary route: `/admin/*`.

Implemented now:

- Role-protected shared hub.
- Provider application review, account lists, system activity, analytics/audit presentation, backup/restore, and account administration components.
- Admin can read the full JSON record snapshot through `visibleRecords()`.

Planned or incomplete:

- Dedicated `components/admin/` pages for provider/listing review, richer account states, platform settings, and unified activity/audit.
- Removal of remaining financial actions from Admin server permissions.
- Relational `platform_settings` and `audit_log`.

Feature link: [[Features/20261009-admin-module]]

## Shared modules

| Capability | Current state | Target feature |
| --- | --- | --- |
| Authentication and roles | Implemented/shipped with outstanding hosted/browser checks | [[Features/20261009-role-based-access]] |
| Booking and availability | JSON compatibility implementation; relational redesign planned | [[Features/20261009-booking-schedule]] |
| Payments | PayMongo integration exists; relational verified-event model planned | [[Features/20261009-paymongo-payments]] |
| Refunds | Embedded JSON flow exists; relational two-step workflow planned | [[Features/20261009-refund-module]] |
| Payouts | Legacy withdrawals exist; booking-linked payouts planned | [[Features/20261009-provider-payouts]] |
| Feedback | Embedded feedback exists; relational immutable feedback planned | [[Features/20261009-feedback-module]] |
| Notifications | Derived client notification UI exists; stored in-app/email outbox planned | [[Features/20261009-notifications]] |
| File storage | R2 plans 1-3 reviewed; migration/cleanup plan 4 pending | [[Features/20261012-r2-file-storage]] |
| Design system | Apple-style plans 1-2 shipped; auth and hub plans remain | [[Features/20261013-apple-design-ui]] |
