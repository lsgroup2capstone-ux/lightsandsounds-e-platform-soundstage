---
artifact: spec
schema: 1
feature: 20261007-standalone-frontend-copy
revision: 1
status: spec-approved
risk: quick
---

# Standalone frontend copy

- Feature id: 20261007-standalone-frontend-copy
- Revision: 1
- Status: spec-approved
- Risk lane: quick
- Approved by: user, 2026-10-07
- Related decisions: none

## Problem

The repository contains the desired client dashboard and password-recovery interface, but those screens are coupled to the main application's shared components and service modules. The user needs a separate, portable Next.js frontend project that preserves the SoundStage experience without duplicating or configuring the existing backend services.

Facts found in the code:

- `app/dashboard/page.tsx` is a route wrapper around `components/dashboard/client-dashboard.tsx`, where the dashboard interface and tab behavior are implemented.
- `app/forgot-password/page.tsx` composes `components/auth/auth-shell.tsx` and `components/auth/forgot-password-form.tsx`.
- `components/dashboard/client-dashboard.tsx` includes overview, bookings, messages, reports, payments, refunds, feedback, notifications, and profile experiences, and imports application data and mutation modules.
- `components/auth/forgot-password-form.tsx` currently invokes the Clerk-backed `requestPasswordReset` function from `lib/client-auth.ts`.
- `app/globals.css` defines the dark SoundStage palette with cyan, purple, green, yellow, and red semantic colors.

## Decisions

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | Where should the copy live? | Create a new root-level `frontend-copy/` folder and leave the current application untouched. | The user needs an isolated copy and the repository already has unrelated work in progress. |
| D2 | What format should the copy use? | Build a standalone Next.js project. | The user selected a separately runnable React/Next.js frontend rather than static files or a source-only snapshot. |
| D3 | How should frontend behavior work without duplicating the backend? | Provide interactive demo data and clean frontend service interfaces for later connection to the existing backend. | The user already has Clerk, Supabase, and Cloudflare R2 and needs only the frontend layer. |
| D4 | Which screens are included? | Include the forgot-password screen and the complete client dashboard with all current tabs and user-facing states. | These are the two requested areas, and the dashboard experience is implemented as one tabbed interface. |
| D5 | How closely should the copy match the existing interface? | Preserve the SoundStage visual direction while fixing obvious frontend issues. | The user selected the current design with targeted UX improvements rather than an exact reproduction or redesign. |
| D6 | Which UX issues are in scope? | Fix broken character rendering, blank authentication/loading presentation, mobile tab usability, and booking-cancellation confirmation styling. | These are visible frontend defects identified in the existing screens and explicitly accepted in the approved summary. |

## Out of scope

- Clerk authentication implementation or configuration: the user already owns the authentication backend.
- Supabase clients, database queries, migrations, schema, or row-level security: this feature is frontend-only.
- Cloudflare R2 upload, storage, credentials, or bucket configuration: the user already owns the storage backend.
- PayMongo or other payment-provider integration: the copy may present payment UI with demo data only.
- Changes to the existing `app/`, `components/`, `lib/`, or `public/` implementation: the copy must remain isolated.
- Deployment, publication, commits, or pushes: none were requested.

## Acceptance criteria

- AC1: WHEN a developer installs dependencies and starts the project in `frontend-copy/`, THE SYSTEM SHALL serve a standalone Next.js frontend without importing source files from outside that folder.
- AC2: WHEN a visitor opens the copied dashboard, THE SYSTEM SHALL display the SoundStage header, overview, and navigation for Overview, My bookings, Messages, Reports, Payments, Refunds, Feedback, and My profile.
- AC3: WHEN a visitor selects a dashboard tab, THE SYSTEM SHALL show the corresponding interactive demo interface without requiring Clerk, Supabase, Cloudflare R2, or another backend service.
- AC4: WHEN a visitor filters bookings, opens booking details, edits profile fields, uses messages or reports, requests a refund, submits feedback, views notifications, or initiates booking cancellation, THE SYSTEM SHALL provide an observable frontend response using demo state.
- AC5: WHEN a visitor initiates booking cancellation, THE SYSTEM SHALL use a SoundStage-styled confirmation dialog rather than a native browser confirmation prompt.
- AC6: WHEN the standalone frontend is loading initial dashboard data, THE SYSTEM SHALL show an intentional loading presentation instead of a blank page.
- AC7: WHEN a visitor opens the forgot-password screen, THE SYSTEM SHALL display the responsive SoundStage authentication layout, validate the email field, show submission progress, and present a demo success or error state without sending a real reset request.
- AC8: WHEN the dashboard is viewed on a narrow screen, THE SYSTEM SHALL keep every tab reachable and make the horizontal navigation state understandable.
- AC9: THE SYSTEM SHALL render user-facing punctuation and separators without mojibake such as `â€”` or `Â·`.
- AC10: THE SYSTEM SHALL provide explicit frontend service boundaries or documented adapter points for connecting the user's existing authentication, data, payment, messaging, refund, and storage services.
- AC11: THE SYSTEM SHALL preserve the established dark SoundStage palette, typography hierarchy, responsive cards, and cyan primary-action treatment.
- AC12: THE SYSTEM SHALL keep all new runtime source, assets, configuration, and documentation inside `frontend-copy/`.

## Non-functional and operational checks

| Area | Requirement or `not applicable` with reason | Evidence |
| --- | --- | --- |
| Security | No credentials, backend secrets, privileged keys, or production endpoints may be added. | Source inspection plus a repository secret scan scoped to `frontend-copy/`. |
| Privacy | Demo records must be fictional and must not contain copied production or personal data. | Source inspection of demo fixtures. |
| Accessibility | Forms, tabs, dialogs, menus, notifications, and status messages must have labels, keyboard behavior, focus visibility, and appropriate semantics. | Automated checks where available plus keyboard-focused manual review. |
| Performance | Avoid unnecessary remote assets and keep demo interactions client-local. | Production build result and manual page-load inspection. |
| Observability | Backend observability is not applicable; visible demo errors and form statuses are required. | Manual interaction checks. |
| Rollback | Remove the isolated `frontend-copy/` folder and its feature artifacts; no existing application files are changed. | Diff inspection. |

## Follow-ups

- Connect the documented frontend adapter points to the user's existing Clerk, Supabase, Cloudflare R2, payment, messaging, and booking services in a separately approved integration feature.

## Change log

- 2026-10-07: revision 1 approved by the user.
