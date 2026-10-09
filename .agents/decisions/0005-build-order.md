# 0005: Build order for the platform modules

- Status: proposed
- Date: 2026-10-09
- Features: all `20261009-*` features

## Context

The platform is specified as shared modules (access, bookings, payments, refunds, payouts, feedback, notifications) and four role modules (client, provider, payroll master, admin). The role modules depend on the shared ones and on each other.

## Decision

Build and test in this order. Role-module specs are split into plans that land in the matching step.

| Step | Capability | Specs (plan parts) |
| --- | --- | --- |
| 1 | Authentication and roles | role-based-access |
| 2 | User and provider profiles | provider-module (profile, documents, portfolio); client-module (profile) |
| 3 | Provider approval | admin-module (provider review, account status) |
| 4 | Service packages | provider-module (packages); admin-module (listing review) |
| 5 | Provider schedules | booking-schedule (availability); provider-module (service areas, availability) |
| 6 | Bookings | booking-schedule (bookings, requests); client-module (browse, compare, book, bookings); provider-module (booking actions) |
| 7 | PayMongo payments | paymongo-payments; client-module (payment) |
| 8 | Payroll Master transactions | payroll-master (payments, history, subscriptions) |
| 9 | Refunds | refund-module; client-module (refund request); payroll-master (refund review) |
| 10 | Provider payouts | provider-payouts; payroll-master (payouts); provider-module (payout view) |
| 11 | Feedback | feedback-module; client-module (feedback); provider-module (feedback view) |
| 12 | Notifications and reports | notifications; payroll-master (reports); admin-module (activity, settings) |

## Consequences

- Each step ends with its plans reviewed and shipped before the next step starts.
- Role dashboards stay separate but share the same booking, payment, and database records.
- A planner must not pull work from a later step into an earlier plan without updating this record.
