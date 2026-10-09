---
artifact: plan
schema: 1
feature: 20261007-standalone-frontend-copy
revision: 1
status: plan-approved
risk: quick
---

# Plan 5: Dashboard interactions and final verification

- Feature: `.agents/features/20261007-standalone-frontend-copy/spec.md`
- Design: `.agents/features/20261007-standalone-frontend-copy/design.md`
- Implements decisions: D3, D4, D5, D6
- Spec revision: 1
- Depends on: plan 4
- Status: plan-approved
- Estimate: about 380 lines of diff; split point: keep the confirmation dialog and image-validation helpers in separate modules if the plan exceeds 400 lines

## Goal

Connect every dashboard control to the demo service, add the styled cancellation dialog, and verify the standalone frontend as one complete interactive experience.

## Evidence (checked in the repository)

- `components/dashboard/client-dashboard.tsx:79`: cancellation currently uses the native `window.confirm` prompt.
- `lib/client-bookings.ts:36`: booking status changes already have a discrete service boundary in the parent app.
- `lib/client-bookings.ts:38`: feedback submission already has a discrete service boundary.
- `lib/client-bookings.ts:40`: refund requests already have a discrete service boundary.
- `lib/client-auth.ts:180`: profile updates already have a discrete service boundary.
- `components/dashboard/client-dashboard.tsx:103`: messages and reports are separate dashboard panel components.

## Phases

### Phase 1: Navigation and booking interactions

- Connect tab selection to panel rendering and URL query state without a full page reload.
- Connect filters, disclosure controls, and cancellation action to demo state.
- Add an accessible SoundStage-styled confirmation dialog with cancel, confirm, progress, failure, and focus-return behavior.

### Phase 2: Form and notification mutations

- Connect message, report, refund, feedback, mark-all-read, and profile forms to the service interface.
- Validate profile images on the client for accepted type and 2 MB size, but keep previews browser-local and explicitly non-uploaded.
- Render success and failure statuses and update visible demo records after each successful action.

### Phase 3: Final standalone verification

- Run typecheck and production build from `frontend-copy/` and fix only in-scope failures.
- Scan `frontend-copy/` for parent imports, secrets, production endpoints, personal data, and mojibake.
- Complete the documented keyboard, responsive, loading, error, and empty-state walkthrough.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T5.1 | T3.1-T4.3 | dashboard controller and tab panels | AC3 | Select every tab with no backend configured and observe local content |
| T5.2 | T5.1 | filters, forms, notifications, profile, demo service | AC4 | Manual interaction matrix records each required observable update |
| T5.3 | T5.1 | confirmation dialog and cancellation mutation | AC5 | Keyboard-driven confirm/cancel/failure checks and source scan excluding `window.confirm` |

## Tests

- Tab selection -> URL and visible panel agree after navigation and refresh.
- Booking filter/details/cancel -> list changes locally and dialog restores focus.
- Messages, reports, refunds, feedback, notifications, and profile -> valid submission updates the visible demo state; invalid input remains actionable.
- Profile image -> accepted type previews locally; oversized or unsupported type produces a visible error.
- Service failure -> safe error status and re-enabled controls.
- Full copy -> typecheck, production build, isolation scan, secret/endpoint scan, and manual responsive keyboard walkthrough.

## Out of scope

- Clerk authentication implementation or configuration.
- Supabase clients, queries, migrations, schema, or row-level security.
- Cloudflare R2 upload, storage, credentials, or bucket configuration.
- PayMongo or another payment-provider integration.
- Changes to the existing `app/`, `components/`, `lib/`, or `public/` implementation.
- Deployment, publication, commits, or pushes.

## Acceptance

- Spec: AC3, AC4, AC5.
- Technical: demo mutations remain browser-local; errors are safe and visible; no client behavior is described as a real authorization or payment control.

## Verification

- Routine local checks: none are verified in `.agents/rules/project.md`; run `npm run typecheck` and `npm run build` from `frontend-copy/` and record their real results.
- Scoped operations: none; do not deploy, call production services, commit, or push.
- Manual: complete every interaction listed in AC3-AC5 at desktop and mobile widths, including keyboard-only dialog use.

## Expert skills to apply

- Sites: guide final responsive, accessibility, interaction, and local-preview quality checks; skip publication.

## Risks and stop points

- A control cannot produce its promised state through the frontend interface -> stop and revise the plan rather than importing backend implementation.
- Production credentials or endpoints appear necessary -> stop; they are explicitly out of scope.
