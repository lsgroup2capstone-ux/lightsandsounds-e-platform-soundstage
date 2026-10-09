---
artifact: spec
schema: 1
feature: 20261009-notifications
revision: 1
status: spec-approved
risk: standard
---

# Notifications module

- Feature id: 20261009-notifications
- Revision: 1
- Status: spec-approved
- Risk lane: standard
- Approved by: user, 2026-10-09
- Related decisions: .agents/decisions/0005-build-order.md (proposed)
- Depends on: .agents/features/20261009-role-based-access/spec.md and the modules that raise events: booking-schedule, paymongo-payments, refund-module, provider-payouts, admin-module

## Problem

Users need to be told when things that affect them happen: provider decisions, booking changes, payments, reschedules, cancellations, refunds, payouts, and completions. Today the notification bell derives a short list in the browser from bookings (completed and provider-cancelled only), nothing is stored per event, and email is used only for sign-in codes.

Facts found in the code:

- `components/communications/event-notifications.tsx` builds notifications client-side from `getClientBookings()` for completed or provider-cancelled bookings; read ids are stored as JSON via `setNotificationReads` (`lib/server/data-service.ts:147-150`).
- Gmail SMTP through `nodemailer` is configured with `GMAIL_SMTP_USER` and `GMAIL_SMTP_APP_PASSWORD` and used only by `app/api/auth/send-email/route.ts`.
- PhilSMS is used only for signup verification (`lib/server/signup-sms.ts`).
- `lib/hub-data.ts:67` mentions provider "notification preferences"; none exist.

## Decisions

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | Channels | In-app for every notification plus email. SMS is a follow-up. | Reuses existing SMTP; SMS costs per message. |
| D2 | Storage and delivery | `soundstage.notifications` (recipient profile, type, title, body, link, read_at, created_at) inserted in the same transaction as the triggering event. Email goes through `soundstage.notification_deliveries` (outbox: notification, channel, status, attempts, last error, next attempt) processed after commit with up to 5 retries and backoff. Email failure never rolls back the event. | No notification for events that did not happen; delivery is resilient. |
| D3 | Events and recipients | See the table below. | User's list mapped to roles. |
| D4 | Preferences | In-app always on; one email on/off setting per profile, default on. | Simple control. |
| D5 | Bell | Replace the existing bell with one reading `notifications`, on all four role dashboards, with unread count and mark-as-read (single and all). Users cannot delete notifications. | One consistent experience. |
| D6 | Email content | Short subject and body with a link to the relevant page; no payout account numbers or payment details beyond the amount. | Email is not a secure channel. |
| D7 | Risk lane | Standard. | Messages only; source events own the money logic. |

## Events and recipients

| Event | Raised by | Recipient |
| --- | --- | --- |
| Provider approved or rejected (with reason) | admin-module | Provider |
| New booking request | booking-schedule | Provider |
| Booking accepted (with payment deadline) or declined (with reason) | booking-schedule | Client |
| Payment confirmed | paymongo-payments | Client and provider |
| Reschedule requested | booking-schedule | Provider |
| Reschedule approved or declined | booking-schedule | Client |
| Cancellation requested | booking-schedule | Provider |
| Cancellation approved, declined, or booking cancelled by the other party | booking-schedule | The other party |
| Refund completed or rejected (with remarks) | refund-module | Client |
| Payout paid (amount, reference) | provider-payouts | Provider |
| Booking completed (with feedback link) | booking-schedule | Client |

## Out of scope

- SMS and push notifications (follow-up).
- Per-category preferences (D4).
- Deleting notifications (D5).
- A dedicated email provider; Gmail daily sending limits apply (follow-up).

## Acceptance criteria

- AC1: WHEN any event in the Events and recipients table occurs, THE SYSTEM SHALL insert one notification per listed recipient in the same transaction as the event.
- AC2: IF the triggering transaction rolls back, THEN THE SYSTEM SHALL leave no notification and send no email for it.
- AC3: WHILE a recipient's email setting is on, THE SYSTEM SHALL queue an email delivery for each new notification; WHILE it is off, THE SYSTEM SHALL queue none.
- AC4: IF an email send fails, THEN THE SYSTEM SHALL retry up to 5 times with backoff, then mark the delivery failed, without changing the event or the in-app notification.
- AC5: IF SMTP is not configured, THEN THE SYSTEM SHALL keep in-app notifications working and mark email deliveries failed with a non-secret reason.
- AC6: WHEN a signed-in user opens any role dashboard, THE SYSTEM SHALL show a bell with the unread count and a list of their own notifications, newest first, paged.
- AC7: WHEN a user opens a notification or chooses "Mark all as read", THE SYSTEM SHALL set `read_at` for their notifications only.
- AC8: IF a user requests another user's notifications or tries to mark them read, THEN THE SYSTEM SHALL reject it.
- AC9: THE SYSTEM SHALL provide no delete operation for notifications.
- AC10: THE SYSTEM SHALL include no payout account numbers or payment details other than amounts in notification text or emails.
- AC11: WHEN a user changes their email setting on their profile, THE SYSTEM SHALL apply it to notifications created afterwards.
- AC12: THE SYSTEM SHALL remove the browser-derived notification list and its JSON read-state usage once the new bell is in place.

## Non-functional and operational checks

| Area | Requirement or `not applicable` with reason | Evidence |
| --- | --- | --- |
| Security | Recipient scoping server-side; SMTP credentials server-only; email content escaped. | Tests for cross-user access; review. |
| Privacy | No sensitive financial details in notifications (AC10). | Tests on templates. |
| Accessibility | Bell has an accessible name with unread count; list keyboard navigable; new count announced politely. | Manual check. |
| Performance | Index on recipient and created_at; unread count query indexed. | Schema review. |
| Observability | Delivery status, attempts, and last error stored; failures logged without credentials. | Tests. |
| Rollback | Additive tables; event modules work without notifications if the insert helper is removed. | Review. |

## Follow-ups

- SMS notifications through PhilSMS.
- Dedicated email provider for higher volume.
- Per-category preferences.
- Payroll master notifications for new refund requests and payouts awaiting review.

## Change log

- 2026-10-09: revision 1 approved by the user.
