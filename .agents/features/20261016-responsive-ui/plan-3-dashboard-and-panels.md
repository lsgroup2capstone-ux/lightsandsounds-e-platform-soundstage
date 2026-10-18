---
artifact: plan
schema: 1
feature: 20261016-responsive-ui
revision: 1
status: planned
risk: standard
---

# Plan 3: Dashboard and panels

- Feature: `.agents/features/20261016-responsive-ui/spec.md`
- Design: none
- Implements decisions: D1, D2, D3, D5
- Spec revision: 1
- Depends on: Plan 1
- Status: planned
- Estimate: about 200 lines

## Goal

The client dashboard header fits at 375px without overlap, and the panels it hosts (payments, communications, system activity, admin accounts) stack and scroll tables inside their containers.

## Evidence (checked in the repository)

- `components/client/client-dashboard.tsx:162`: one non-wrapping row with Logo, ThemeToggle, EventNotifications, Browse button and profile `details` (`h-9`).
- `components/client/client-dashboard.tsx:162`: tab bar already `overflow-x-auto`; the name is hidden below `sm`.
- `components/communications/communication-panels.tsx:51`: `lg:grid-cols-2` panels.
- `components/payment/recent-transactions.tsx:30`, `subscription-panel.tsx:49`, `payment-method-picker.tsx:25`: tables and grids.
- `components/hubs/admin/admin-accounts.tsx:30`, `components/hubs/admin/system-activity.tsx:32`: `sm:grid-cols-2` and table.
- Overlap: apple-design-ui plan 4 also touches the client dashboard.

## Phases

### Phase 1: Dashboard header

- At 375px shorten or icon-ify 'Browse services', add `gap-2`, `min-w-0`, `shrink-0` so controls stay on screen; raise the profile summary to 40px on touch.

### Phase 2: Panels

- Make communications, payment, admin-accounts and system-activity grids single-column below `md`; wrap tables in `overflow-x-auto` containers.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T3.1 | none | client-dashboard.tsx header | AC3, AC6 | Manual: 375px header, no overlap |
| T3.2 | T3.1 | communication-panels.tsx, payment/* | AC4, AC5 | Manual at 375/768 |
| T3.3 | T3.1 | admin-accounts.tsx, system-activity.tsx | AC2, AC4, AC5 | Manual at 375/768/1280 |

## Tests

- Layout has no automated test in this repo; evidence is manual viewport checks (AC2-AC6).
- The existing suite must pass unchanged (`npm test`), AC7.

## Out of scope

- Visual redesign, new colors, new components beyond a mobile menu (D3).
- Behavior, data or API changes; new dependencies.
- Native app or PWA work.
- Card-style table layouts on mobile (D5).
- Pages owned by other plans in this feature.

## Acceptance

- Spec: AC3, AC4, AC5 for dashboard and panels; AC2
- Technical: Tailwind classes only; mobile-first (base is mobile, `sm:`/`md:`/`lg:` widen); desktop (>=1024px) appearance unchanged. `tests/system-activity.cjs` has a known failure recorded in tasks.md; do not chase it. Rollback: revert the commit.

## Verification

- Routine local checks: `npm run typecheck` and `npm test` (scripts in package.json); `npm run lint` and `npm run build` are also defined but not yet verified in this repo, so record real output. `.agents/rules/project.md` is still the blank template.
- Scoped operations: none.
- Manual: in browser devtools at 375px, 768px and 1280px, load each touched page; confirm no page-level horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`) and controls are >= 40px tall at 375px.

## Expert skills to apply

- none applicable in `.agents/skills/` (only `prompt-master`, used for prompts.md).

## Risks and stop points

- A file has uncommitted changes you did not make: stop and report (AGENTS.md).
- A fix would need a redesign or card layout: stop and record it as a follow-up (D5).
