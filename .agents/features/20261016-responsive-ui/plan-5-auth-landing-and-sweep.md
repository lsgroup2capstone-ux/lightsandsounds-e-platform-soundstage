---
artifact: plan
schema: 1
feature: 20261016-responsive-ui
revision: 1
status: planned
risk: standard
---

# Plan 5: Auth landing and sweep

- Feature: `.agents/features/20261016-responsive-ui/spec.md`
- Design: none
- Implements decisions: D1, D2, D3
- Spec revision: 1
- Depends on: Plans 1-4
- Status: planned
- Estimate: about 150 lines

## Goal

Auth pages and the landing page are responsive, and a final sweep shows no page scrolls horizontally at 375/768/1280.

## Evidence (checked in the repository)

- `components/auth/signup-form.tsx:65,99`: already `grid-cols-1 sm:grid-cols-2`.
- `components/landing/sections.tsx:48,81,140,154`: multi-column grids and a `lg:grid-cols-2` section.
- `app/login`, `app/signup`, `app/forgot-password`, `app/reset-password`, `app/verify-otp`: auth routes.
- Overlap: apple-design-ui plan 3 (auth pages, plan-approved, not implemented) edits `login-form.tsx`.

## Phases

### Phase 1: Landing and auth

- Check hero type scale, section grids and footer at 375px; fix overflow and touch targets in auth forms.

### Phase 2: Final sweep

- Visit every route under `app/` at 375/768/1280; fix remaining page-level overflow; record the route table in the impl report.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T5.1 | none | landing/sections.tsx, site-footer.tsx | AC2, AC4, AC6 | Manual at 375/768/1280 |
| T5.2 | none | components/auth/*, auth routes | AC2, AC4, AC6 | Manual |
| T5.3 | T5.1, T5.2 | any remaining page | AC2, AC7 | Route-by-route sweep table; `npm run typecheck`; `npm test`; empty package.json diff |

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

- Spec: AC2 (final), AC4, AC6, AC7
- Technical: Tailwind classes only; mobile-first (base is mobile, `sm:`/`md:`/`lg:` widen); desktop (>=1024px) appearance unchanged. Order: run after apple-design-ui plan 3 ships, or confirm ownership of auth files first. Rollback: revert the commit.

## Verification

- Routine local checks: `npm run typecheck` and `npm test` (scripts in package.json); `npm run lint` and `npm run build` are also defined but not yet verified in this repo, so record real output. `.agents/rules/project.md` is still the blank template.
- Scoped operations: none.
- Manual: in browser devtools at 375px, 768px and 1280px, load each touched page; confirm no page-level horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`) and controls are >= 40px tall at 375px.

## Expert skills to apply

- none applicable in `.agents/skills/` (only `prompt-master`, used for prompts.md).

## Risks and stop points

- A file has uncommitted changes you did not make: stop and report (AGENTS.md).
- A fix would need a redesign or card layout: stop and record it as a follow-up (D5).
