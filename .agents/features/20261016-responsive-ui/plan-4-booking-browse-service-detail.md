---
artifact: plan
schema: 1
feature: 20261016-responsive-ui
revision: 1
status: planned
risk: standard
---

# Plan 4: Booking browse service detail

- Feature: `.agents/features/20261016-responsive-ui/spec.md`
- Design: none
- Implements decisions: D1, D2, D3
- Spec revision: 1
- Depends on: Plan 1
- Status: planned
- Estimate: about 150 lines

## Goal

Booking, browse and service-detail pages stack to one column on mobile and never scroll the page sideways.

## Evidence (checked in the repository)

- `components/booking/booking-flow.tsx:220`: `grid grid-cols-2 gap-3` (fixed two columns).
- `components/booking/booking-date-picker.tsx:21`: `grid-cols-7` calendar; cell size and tap target at 375px.
- `components/marketplace/services-browser.tsx:86`, `components/marketplace/provider-profile.tsx:112`: `sm:grid-cols-2 xl:grid-cols-3` cards (already mobile-first).
- `app/(marketplace)/services/[id]/page.tsx:92,174` and `components/marketplace/provider-service-detail.tsx`: grids and gallery.

## Phases

### Phase 1: Booking

- Make booking-flow's 2-col grid `grid-cols-1 sm:grid-cols-2` unless fields are short; ensure date-picker cells are >= 40px tappable and fit 375px.

### Phase 2: Browse and service detail

- Verify filters, search row and card grids wrap; add `min-w-0` and `break-words` for long titles; fix any overflowing gallery or fixed widths.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T4.1 | none | booking-flow.tsx, booking-date-picker.tsx | AC2, AC4, AC6 | Manual: booking flow at 375/768/1280 |
| T4.2 | none | browse/*, app/(marketplace)/services/[id]/page.tsx, provider-service-detail.tsx | AC2, AC4, AC6 | Manual: /browse and /services/<id> |

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

- Spec: AC2, AC4, AC6 for booking, browse and service detail
- Technical: Tailwind classes only; mobile-first (base is mobile, `sm:`/`md:`/`lg:` widen); desktop (>=1024px) appearance unchanged. none beyond the shared risks. Rollback: revert the commit.

## Verification

- Routine local checks: `npm run typecheck` and `npm test` (scripts in package.json); `npm run lint` and `npm run build` are also defined but not yet verified in this repo, so record real output. `.agents/rules/project.md` is still the blank template.
- Scoped operations: none.
- Manual: in browser devtools at 375px, 768px and 1280px, load each touched page; confirm no page-level horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`) and controls are >= 40px tall at 375px.

## Expert skills to apply

- none applicable in `.agents/skills/` (only `prompt-master`, used for prompts.md).

## Risks and stop points

- A file has uncommitted changes you did not make: stop and report (AGENTS.md).
- A fix would need a redesign or card layout: stop and record it as a follow-up (D5).
