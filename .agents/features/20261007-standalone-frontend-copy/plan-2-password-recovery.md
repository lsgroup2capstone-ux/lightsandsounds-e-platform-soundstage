---
artifact: plan
schema: 1
feature: 20261007-standalone-frontend-copy
revision: 1
status: plan-approved
risk: quick
---

# Plan 2: Password-recovery frontend

- Feature: `.agents/features/20261007-standalone-frontend-copy/spec.md`
- Design: `.agents/features/20261007-standalone-frontend-copy/design.md`
- Implements decisions: D3, D4, D5, D6
- Spec revision: 1
- Depends on: plan 1
- Status: plan-approved
- Estimate: about 240 lines of diff; split point: none

## Goal

Build the responsive forgot-password experience with SoundStage branding, field validation, submission progress, and demo success and failure states through the frontend service contract.

## Evidence (checked in the repository)

- `app/forgot-password/page.tsx:1`: the current route composes a shared auth shell and forgot-password form.
- `components/auth/auth-shell.tsx:5`: the current brand panel presents three platform benefit points.
- `components/auth/auth-shell.tsx:11`: the authentication layout is a reusable shell.
- `components/auth/forgot-password-form.tsx:12`: the form is currently a client component.
- `components/auth/forgot-password-form.tsx:24`: the current form calls a backend-backed reset function directly.
- `components/auth/forgot-password-form.tsx:26`: success currently navigates immediately to the verification route.

## Phases

### Phase 1: Responsive authentication shell

- Recreate the two-panel desktop layout using local gradients and decorative lighting rather than a remote or parent asset.
- Collapse to a focused, single-column form on smaller screens.
- Preserve the logo, benefit list, heading hierarchy, and high-contrast form treatment.

### Phase 2: Interactive demo reset form

- Add labelled email input, inline validation, loading state, status messages, and back-to-dashboard link.
- Call `FrontendService.requestPasswordReset` and show a non-navigating demo success state that clearly explains no email was sent.
- Provide a deterministic fictional error trigger documented for reviewers.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T2.1 | T1.1-T1.3 | `frontend-copy/app/forgot-password`, auth components | AC7 | Manual responsive inspection and keyboard traversal |
| T2.2 | T2.1 | reset form and demo service use | AC7 | Submit valid, invalid, loading, success, and documented failure cases |

## Tests

- Empty and malformed email -> browser validation or inline error without service call.
- Valid demo email -> visible progress followed by explicit demo success.
- Documented failure email -> safe error, retained value, and re-enabled submit control.
- Narrow viewport -> single-column layout with logo and all controls reachable.

## Out of scope

- Clerk authentication implementation or configuration.
- Supabase clients, queries, migrations, schema, or row-level security.
- Cloudflare R2 upload, storage, credentials, or bucket configuration.
- PayMongo or another payment-provider integration.
- Changes to the existing `app/`, `components/`, `lib/`, or `public/` implementation.
- Deployment, publication, commits, or pushes.

## Acceptance

- Spec: AC7.
- Technical: no reset request leaves the browser; status content is announced accessibly; no production-looking confirmation implies a real email was sent.

## Verification

- Routine local checks: run the standalone typecheck and production build after this plan.
- Scoped operations: none.
- Manual: test validation, progress, success, failure, focus order, and desktop/mobile layouts.

## Expert skills to apply

- Sites: guide responsive composition, readable copy, and accessible form behavior without adding hosting work.

## Risks and stop points

- The UI would need a real verification route to imply a completed backend action -> keep the demo success in place and document the future adapter destination.
