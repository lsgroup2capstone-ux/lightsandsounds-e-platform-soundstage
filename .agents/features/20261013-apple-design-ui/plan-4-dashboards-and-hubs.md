---
artifact: plan
schema: 1
feature: 20261013-apple-design-ui
revision: 1
status: plan-approved
risk: standard
---

# Plan 4: Dashboards, hubs and glow removal

- Feature: `.agents/features/20261013-apple-design-ui/spec.md`
- Design: none
- Implements decisions: D2, D4, D5, D6
- Spec revision: 1
- Depends on: plans 1–3
- Status: plan-approved
- Estimate: about 200 lines of diff

## Goal

Client dashboard and admin/provider/payroll workspaces use a frosted sidebar
(macOS source-list style), frosted top bar and grouped rounded cards, with no
glow. The temporary `glow-*` utilities are deleted, so the whole app meets AC3.

## Evidence (checked in the repository)

- `components/hubs/hub-workspace.tsx:362`: sidebar `bg-card/95 backdrop-blur-xl`, header `bg-background/85 backdrop-blur-xl`, active nav `bg-primary/12 text-primary`; 3 glow/`font-display` hits.
- `components/dashboard/client-dashboard.tsx` (5 hits).
- `components/hubs/admin-accounts.tsx`, `backup-restore.tsx`, `provider-applications.tsx`, `system-activity.tsx`.
- `app/payroll-master/[[...slug]]/` (untracked), `app/admin`, `app/provider`, `app/client`.
- `app/globals.css:127-133`: glow utilities (neutralised in plan 1).
- `hub-workspace.tsx`, `client-dashboard.tsx`, `admin-accounts.tsx` had uncommitted changes not from this feature; `.agents/features/20261009-booking-schedule/plan-4-rewire-and-compatibility.md` also edits hub/dashboard files.

## Phases

### Phase 1: Workspaces

- Sidebar: `glass`; nav items `rounded-lg`, active `bg-foreground/[0.06] text-foreground` with accent icon; muted small section label.
- Top bar: `glass`, hairline border.
- Content: title `text-3xl font-semibold tracking-tight`; stat/list cards `rounded-2xl shadow-soft bg-card`; notice banner `rounded-xl`.
- Client dashboard, hub sub-components, payroll pages: same treatment, remove glow.

### Phase 2: Clean-up

- Delete `glow-primary` / `glow-accent` from `globals.css`; confirm no `glow-`, `#00e5ff`, `#b026ff` in `app/` or `components/`.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T4.1 | plans 1–3 | `components/hubs/hub-workspace.tsx` | AC6 (sidebar) | manual `/admin`, `/provider` light + dark, mobile drawer |
| T4.2 | T4.1 | `components/dashboard/*`, other `components/hubs/*`, payroll pages | AC9 (plan 4) | manual `/client`, `/payroll-master` |
| T4.3 | T4.2 | `app/globals.css` | AC3 | grep for `glow-`, `#00e5ff`, `#b026ff` in `app` and `components` returns nothing |
| T4.4 | T4.3 | repo | AC8 | `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` all pass |

## Tests

- Existing suite stays green (`tests/admin-accounts.cjs`, `tests/system-activity.cjs`, etc.).

## Out of scope

- From spec: animation dependencies, manual theme toggle, copy/IA changes, data/auth/API changes, standalone frontend copy.
- Booking-schedule rewiring logic.

## Acceptance

- Spec: AC3, AC6 (sidebar), AC8 (final full run), AC9 (plan 4 surfaces).
- Technical: class-only edits plus utility deletion.

## Verification

- Routine local checks: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- Scoped operations: none.
- Manual: every hub route in both modes and at mobile width.

## Expert skills to apply

- none found applicable.

## Risks and stop points

- Pre-existing uncommitted changes in hub/dashboard files → stop and ask before editing.
- Booking-schedule plan 4 edits the same files → recommended: ship it first; otherwise stop and ask.
