---
tags:
  - project/decisions
updated: 2026-10-15
---

# Decisions

Related notes: [[Architecture]] · [[Database]] · [[Modules]] · [[Dependencies]]

## Status rule

The specs below are approved. The project-wide ADR files `0001` through `0005` still declare `Status: proposed`. This note preserves that distinction: an approved spec can provide the current implementation contract without silently promoting a proposed ADR to accepted.

## Approved technical directions

| Area | Approved direction | Source |
| --- | --- | --- |
| Authentication | Clerk authenticates all four roles; `soundstage.profiles` is authoritative for role/status and Clerk metadata is a fast mirror. | [[Features/20261009-role-based-access]] |
| Protected areas | `/client`, `/provider`, `/payroll-master`, and `/admin` are role-confined; server layouts recheck the database. | [[Features/20261009-role-based-access]] |
| Privileged roles | Signup can choose only client/provider; admin and payroll master are assigned through a server-side path. | [[Features/20261009-role-based-access]] |
| Booking source | Relational booking tables will replace JSON bookings as the only authoritative booking source, with transactional status history and overlap prevention. | [[Features/20261009-booking-schedule]] |
| Payment authority | A booking/payment becomes paid only from a verified PayMongo webhook; browser return pages display status only. | [[Features/20261009-paymongo-payments]] |
| Money ownership | Payroll Master owns refund, payout, and manual subscription-payment decisions; Admin has no financial views in the target design. | [[Features/20261009-payroll-master]] · [[Features/20261009-admin-module]] |
| Financial integrity | Financial records are retained, corrections use new records/status changes, and money decisions write append-only audit entries transactionally. | [[Features/20261009-payroll-master]] · [[Features/20261009-refund-module]] · [[Features/20261009-provider-payouts]] |
| File storage | Provider documents are private signed-URL objects; public images use R2 public URLs; the database stores keys, not base64. | [[Features/20261012-r2-file-storage]] |
| Feedback | One immutable review per completed booking; public identity is first name plus last initial. | [[Features/20261009-feedback-module]] |
| Notifications | In-app is always on; email uses an outbox and retries; email failure does not roll back the source event. | [[Features/20261009-notifications]] |
| Browse | `/browse` lists approved providers rather than packages; provider pages list active services. | [[Features/20261014-provider-browse]] |
| Ratings | Ratings are per service, derived from completed booking feedback, and exposed through a sanitized public record. | [[Features/20261014-service-ratings]] |
| UI | Light is default, user-selectable dark mode is persisted, and the system uses a restrained Apple-blue design direction without a new animation dependency. | [[Features/20261013-apple-design-ui]] |

## ADR register

| ADR | Declared status | Decision summary |
| --- | --- | --- |
| `0001-clerk-auth-profiles-roles.md` | Proposed | Clerk authenticates; `profiles` owns roles |
| `0002-bookings-relational-source.md` | Proposed | Bookings move to relational tables and verified payment controls confirmation |
| `0003-payments-webhook-only.md` | Proposed | Paid state comes only from verified, deduplicated webhooks |
| `0004-financial-records-and-audit.md` | Proposed | Financial rows are not deleted; money/admin decisions are audited |
| `0005-build-order.md` | Proposed | Twelve-step dependency-aware platform build order |

Original ADRs remain in `.agents/decisions/`; update their statuses only through the project's decision process.

## Known transitional contradictions

- The current JSON implementation still lets Admin call some financial review actions, while approved target specs reserve them for Payroll Master.
- PayMongo currently settles JSON payment records and does not yet store deduplicated event IDs in relational tables.
- `database/README.md` begins with historical Supabase-admin wording that lags the Clerk-for-all-roles direction.
- The current booking flow creates a pending booking around checkout and uses legacy statuses; the approved schedule/payment design moves payment after provider acceptance with `awaiting_payment`.

These are roadmap gaps, not new decisions. See [[Development-Roadmap]] and [[Bug-Tracker]].
