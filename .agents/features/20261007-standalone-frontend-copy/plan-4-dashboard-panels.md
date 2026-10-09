---
artifact: plan
schema: 1
feature: 20261007-standalone-frontend-copy
revision: 1
status: plan-approved
risk: quick
---

# Plan 4: Complete dashboard panels

- Feature: `.agents/features/20261007-standalone-frontend-copy/spec.md`
- Design: `.agents/features/20261007-standalone-frontend-copy/design.md`
- Implements decisions: D3, D4, D5
- Spec revision: 1
- Depends on: plan 3
- Status: plan-approved
- Estimate: about 390 lines of diff; split point: separate communications and financial panel groups if the plan exceeds 400 lines

## Goal

Complete the dashboard presentation with messages, reports, payments, refunds, feedback, and notification panels so every approved tab and major state is represented.

## Evidence (checked in the repository)

- `components/communications/communication-panels.tsx:13`: the current message interface groups conversations by booking.
- `components/communications/communication-panels.tsx:34`: the current report interface combines submission and report history.
- `components/dashboard/client-dashboard.tsx:84`: payments are presented as paid-booking records with receipt access.
- `components/payment/refunds-panel.tsx:10`: refund eligibility and request presentation are booking-based.
- `components/dashboard/client-dashboard.tsx:90`: feedback is available for completed bookings.
- `components/communications/event-notifications.tsx:12`: notifications represent completed and provider-cancelled events.

## Phases

### Phase 1: Communication panels

- Add conversation selection, message history, composer presentation, and empty state.
- Add provider-report form, reason choices, report history, statuses, and empty state.

### Phase 2: Financial panels

- Add payment history, amounts, demo receipt presentation, and empty state.
- Add refund eligibility, method and account fields, current status, and empty state.

### Phase 3: Feedback and notifications

- Add completed-event feedback cards, rating and comment form, submitted state, and empty state.
- Add notification dialog presentation, unread count, mark-all entry point, timestamps, and contextual next-step copy.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T4.1 | T3.1 | message and report panels | AC2 | Every communication tab renders from the dashboard navigation |
| T4.2 | T3.1 | payment and refund panels | AC2 | Every financial tab renders populated and empty states |
| T4.3 | T3.1 | feedback and notification panels | AC2 | Feedback tab and notification dialog render with labelled controls |

## Tests

- Each dashboard tab -> correct panel heading, populated content, and empty-state path.
- Notification trigger -> dialog has a title, close path, unread count, and keyboard focus behavior.
- Forms -> labels, constraints, and status regions are present before mutation wiring.

## Out of scope

- Clerk authentication implementation or configuration.
- Supabase clients, queries, migrations, schema, or row-level security.
- Cloudflare R2 upload, storage, credentials, or bucket configuration.
- PayMongo or another payment-provider integration.
- Changes to the existing `app/`, `components/`, `lib/`, or `public/` implementation.
- Deployment, publication, commits, or pushes.

## Acceptance

- Spec: AC2.
- Technical: all eight dashboard destinations and notifications are present; panels consume UI-facing demo types rather than backend modules.

## Verification

- Routine local checks: run the standalone typecheck and production build after this plan.
- Scoped operations: none.
- Manual: open every tab and notification dialog; inspect populated and empty presentations at desktop and mobile widths.

## Expert skills to apply

- Sites: guide responsive information density, dialog behavior, and accessible form presentation.

## Risks and stop points

- Repeated form or card markup creates inconsistent semantics -> extract the smallest local primitive without introducing a new dependency.
