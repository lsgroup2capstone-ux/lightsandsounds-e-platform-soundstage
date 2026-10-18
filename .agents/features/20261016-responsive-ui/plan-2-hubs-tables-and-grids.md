---
artifact: plan
schema: 1
feature: 20261016-responsive-ui
revision: 1
status: planned
risk: standard
---

# Plan 2: Hubs tables and grids

- Feature: `.agents/features/20261016-responsive-ui/spec.md`
- Design: none
- Implements decisions: D1, D2, D3, D5
- Spec revision: 1
- Depends on: Plan 1
- Status: planned
- Estimate: about 250 lines; split point: provider hub vs admin/payroll hubs

## Goal

Provider, admin and payroll hub screens render cleanly at 375px and 768px: the sidebar drawer works, stat and calendar grids stack, and wide tables scroll only inside their container.

## Evidence (checked in the repository)

- `components/hubs/hub-workspace.tsx:57`: tables `min-w-[680px]` in `overflow-x-auto` (keep, per D5).
- `components/hubs/hub-workspace.tsx:70,94,136`: `lg:grid-cols-[1.3fr_1fr]` already stacks below lg.
- `components/hubs/hub-workspace.tsx:144`: `grid grid-cols-7` calendar; check cell size at 375px.
- `components/hubs/hub-workspace.tsx:329-424`: `sm:grid-cols-2/3`, `xl:grid-cols-4` stat grids; verify one column below `sm`.
- `components/hubs/hub-workspace.tsx:483`: fixed `w-72` aside with `mobileOpen` drawer and `max-w-[1440px]` shell; check main padding and top bar at 375px.
- `components/hubs/admin/provider-applications.tsx`, `components/hubs/admin/backup-restore.tsx`: hub sub-screens to sweep.
- Overlap: `.agents/features/20261013-apple-design-ui/plan-4-dashboards-and-hubs.md` (plan-approved, not implemented) also edits `hub-workspace.tsx`.

## Phases

### Phase 1: Shell and top bar

- Audit the hub top bar and content padding at 375px; add `min-w-0`, `flex-wrap`, `truncate` and responsive padding as needed.

### Phase 2: Grids and tables

- Ensure every grid is single-column (or two for short stats) below `sm`; keep tables in `overflow-x-auto` containers and confirm the container, not the page, scrolls (`min-w-0` on flex/grid parents).
- Sweep `provider-applications.tsx` and `backup-restore.tsx`.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T2.1 | none | hub-workspace.tsx shell/top bar | AC2, AC6 | Manual at 375/768/1280 for provider, admin, payroll hubs |
| T2.2 | T2.1 | hub-workspace.tsx grids | AC4 | Manual: stat/calendar/form grids stack below 768px |
| T2.3 | T2.1 | hub-workspace.tsx tables, provider-applications.tsx, backup-restore.tsx | AC5 | Manual: wide table scrolls inside its container only |

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

- Spec: AC2, AC4, AC5 for hub pages
- Technical: Tailwind classes only; mobile-first (base is mobile, `sm:`/`md:`/`lg:` widen); desktop (>=1024px) appearance unchanged. Order: run after apple-design-ui plan 4 ships, or confirm ownership of `hub-workspace.tsx` first. Rollback: revert the commit.

## Verification

- Routine local checks: `npm run typecheck` and `npm test` (scripts in package.json); `npm run lint` and `npm run build` are also defined but not yet verified in this repo, so record real output. `.agents/rules/project.md` is still the blank template.
- Scoped operations: none.
- Manual: in browser devtools at 375px, 768px and 1280px, load each touched page; confirm no page-level horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`) and controls are >= 40px tall at 375px.

## Expert skills to apply

- none applicable in `.agents/skills/` (only `prompt-master`, used for prompts.md).

## Risks and stop points

- A file has uncommitted changes you did not make: stop and report (AGENTS.md).
- A fix would need a redesign or card layout: stop and record it as a follow-up (D5).
