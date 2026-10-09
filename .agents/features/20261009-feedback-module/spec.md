---
artifact: spec
schema: 1
feature: 20261009-feedback-module
revision: 1
status: spec-approved
risk: standard
---

# Feedback module

- Feature id: 20261009-feedback-module
- Revision: 1
- Status: spec-approved
- Risk lane: standard
- Approved by: user, 2026-10-09
- Related decisions: .agents/decisions/0002-bookings-relational-source.md, .agents/decisions/0005-build-order.md (both proposed)
- Depends on: .agents/features/20261009-booking-schedule/spec.md, .agents/features/20261009-role-based-access/spec.md
- Used by: .agents/features/20261009-client-module/spec.md (submit UI), .agents/features/20261009-provider-module/spec.md (read-only UI)

## Problem

Feedback must link the client, provider, and booking as its own record, with the database guaranteeing one review per completed booking by its own client. Today feedback is a field on JSON bookings.

Facts found in the code:

- `submitEventFeedback(id, rating, comment)` (`lib/server/domain/client-bookings.ts:74-86`) requires the client's own booking, status Completed, no prior feedback, integer rating 1-5, and a trimmed comment of 1-2,000 characters; it stores `booking.feedback = { rating, comment, createdAt }`.
- Client spec D11/AC21 and provider spec D15/AC26 already describe submitting and viewing feedback; they are revised to reference this module.

## Decisions

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | Storage | `soundstage.booking_feedback` (booking id unique, client id, provider id, rating 1-5, comment, created_at). Existing JSON feedback is migrated. | Links client, provider, booking; database enforces one per booking. |
| D2 | Rules | Only the booking's client; booking `completed`; one review per booking; rating integer 1-5; comment 1-2,000 characters after trimming. | User rules plus existing validation. |
| D3 | Editing and moderation | Feedback cannot be edited or deleted after submission. No admin moderation in this feature. | Integrity; moderation is a follow-up. |
| D4 | Risk lane | Standard. | No money; ownership checks only. |

## Out of scope

- Editing or deleting feedback (D3).
- Admin moderation or hiding reviews (follow-up).
- Provider replies.

## Acceptance criteria

- AC1: WHEN the client who owns a `completed` booking submits a valid rating and comment, THE SYSTEM SHALL insert one `booking_feedback` row linking the booking, client, and provider.
- AC2: IF the submitter is not the booking's client, THEN THE SYSTEM SHALL reject the submission without revealing booking details.
- AC3: IF the booking is not `completed`, THEN THE SYSTEM SHALL reject the submission.
- AC4: IF feedback already exists for the booking, including from a concurrent submission, THEN THE SYSTEM SHALL reject the second, enforced by a unique constraint.
- AC5: IF the rating is not an integer 1-5 or the trimmed comment is empty or over 2,000 characters, THEN THE SYSTEM SHALL reject the submission with a field-level message.
- AC6: THE SYSTEM SHALL provide no edit or delete operation for feedback, and the database SHALL reject `UPDATE` and `DELETE` on `booking_feedback` from application code.
- AC7: THE SYSTEM SHALL expose per-provider feedback lists and average rating for provider and client views.
- AC8: WHEN the migration runs, THE SYSTEM SHALL copy existing JSON booking feedback into `booking_feedback`, skip already-migrated rows, and leave JSON data unchanged.

## Non-functional and operational checks

| Area | Requirement or `not applicable` with reason | Evidence |
| --- | --- | --- |
| Security | Ownership and status checked server-side; parameterized SQL. | Tests for denial and duplicates. |
| Privacy | Public views show client first name and last initial only. | Review of rendered fields. |
| Accessibility | Star rating operable by keyboard and labelled. | Manual check. |
| Performance | Index on provider id for lists and averages. | Schema review. |
| Observability | Submission recorded via existing activity log. | Test. |
| Rollback | Additive table; JSON feedback untouched. | Migration review. |

## Follow-ups

- Admin moderation of abusive reviews.
- Provider replies to feedback.

## Change log

- 2026-10-09: revision 1 approved by the user.
