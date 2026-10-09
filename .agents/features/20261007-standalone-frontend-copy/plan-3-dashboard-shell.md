---
artifact: plan
schema: 1
feature: 20261007-standalone-frontend-copy
revision: 1
status: plan-approved
risk: quick
---

# Plan 3: Dashboard shell and core panels

- Feature: `.agents/features/20261007-standalone-frontend-copy/spec.md`
- Design: `.agents/features/20261007-standalone-frontend-copy/design.md`
- Implements decisions: D3, D4, D5, D6
- Spec revision: 1
- Depends on: plan 1
- Status: plan-approved
- Estimate: about 390 lines of diff; split point: extract booking cards before adding profile fields if the plan exceeds 400 lines

## Goal

Build the responsive dashboard shell, intentional loading state, accessible mobile tab navigation, overview, bookings presentation, and profile presentation on top of the demo service.

## Evidence (checked in the repository)

- `components/dashboard/client-dashboard.tsx:29`: the current dashboard defines eight user-facing tabs.
- `components/dashboard/client-dashboard.tsx:32`: booking rows own summary and expandable-detail presentation.
- `components/dashboard/client-dashboard.tsx:54`: the overview displays booking and payment summaries.
- `components/dashboard/client-dashboard.tsx:75`: bookings provide status filters.
- `components/dashboard/client-dashboard.tsx:106`: profile editing includes identity, contact, and image controls.
- `components/dashboard/client-dashboard.tsx:133`: one client component owns the dashboard shell and active tab.
- `components/dashboard/client-dashboard.tsx:155`: the current authentication check returns a blank screen while pending.

## Phases

### Phase 1: Dashboard frame and navigation

- Build the local dashboard route with header, logo, notification entry point, browse shortcut, user menu, greeting, and all eight tab labels.
- Add a skeleton-based initial loading state driven by simulated service latency.
- Implement keyboard-reachable, horizontally scrollable mobile navigation with current-tab visibility and an accessible label.

### Phase 2: Overview and bookings presentation

- Add summary cards, next-event card, browse callout, and event checklist.
- Add booking filter controls, image-independent booking cards, status badges, totals, expandable details, empty states, and cancellation entry points.
- Defer mutation behavior and the styled confirmation dialog to plan 5.

### Phase 3: Profile presentation

- Add profile avatar preview, file-picker presentation, name, read-only email, mobile number, status region, and save action.
- Defer persistence and file-state behavior to plan 5.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T3.1 | T1.1-T1.3 | dashboard route, shell, loading state | AC6 | Simulated initial delay visibly renders skeletons before dashboard content |
| T3.2 | T3.1 | responsive tab navigation | AC8 | Keyboard and narrow-viewport manual checks reach every tab label |
| T3.3 | T3.1 | overview, booking, profile components | none; contributes to AC2 and AC4 completed in later plans | Typecheck and manual presentation inspection |

## Tests

- Initial route load -> skeletons appear before demo data.
- Narrow viewport -> all tabs remain reachable and active state stays visible.
- Empty and populated booking fixtures -> appropriate list or empty state renders.
- Booking details -> semantic disclosure content is readable with keyboard controls.

## Out of scope

- Clerk authentication implementation or configuration.
- Supabase clients, queries, migrations, schema, or row-level security.
- Cloudflare R2 upload, storage, credentials, or bucket configuration.
- PayMongo or another payment-provider integration.
- Changes to the existing `app/`, `components/`, `lib/`, or `public/` implementation.
- Deployment, publication, commits, or pushes.

## Acceptance

- Spec: AC6, AC8.
- Technical: no blank initial state; responsive navigation has semantic labelling, focus visibility, and scroll affordance.

## Verification

- Routine local checks: run the standalone typecheck and production build after this plan.
- Scoped operations: none.
- Manual: inspect loading, desktop and mobile headers, keyboard tab reachability, overview, booking details, empty state, and profile layout.

## Expert skills to apply

- Sites: preserve responsive hierarchy, content readability, accessible interaction cues, and established branding.

## Risks and stop points

- Core panel markup pushes a component above the 300-line project target -> split it before adding more panels.
