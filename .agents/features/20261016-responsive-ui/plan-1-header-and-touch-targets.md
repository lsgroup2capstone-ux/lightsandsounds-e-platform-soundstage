---
artifact: plan
schema: 1
feature: 20261016-responsive-ui
revision: 1
status: planned
risk: standard
---

# Plan 1: Header and touch targets

- Feature: `.agents/features/20261016-responsive-ui/spec.md`
- Design: none
- Implements decisions: D1, D2, D3, D4
- Spec revision: 1
- Depends on: none
- Status: planned
- Estimate: about 150 lines

## Goal

The site header shows a labelled, keyboard-operable menu button below `md` that reveals the same four nav links, and shared UI primitives meet the 40px touch-target floor on touch widths without changing desktop sizes.

## Evidence (checked in the repository)

- `components/site/site-header.tsx:31`: nav is `hidden ... md:flex`; no mobile alternative. Links come from the `nav` array (`site-header.tsx:10-15`).
- `components/site/site-header.tsx:56,59`: auth buttons already use `h-11 sm:h-8`, the touch-target pattern to reuse.
- `components/ui/button.tsx:25-33`: default `h-9`, `sm` `h-8`, `xs` `h-6`, `icon` `size-9` are below 40px.
- `components/ui/tabs.tsx:27`: list height `h-9`. `components/ui/select.tsx:44` and `components/ui/input.tsx`: control heights to check.
- `components/ui/dialog.tsx` exists and may be reused; otherwise use an inline disclosure panel inside the header.

## Phases

### Phase 1: Mobile menu

- Add a `md:hidden` icon button (lucide `Menu`/`X`, `aria-label`, `aria-expanded`, `aria-controls`) in `site-header.tsx` toggling a panel under the header that maps the existing `nav` array. Close on link click and Escape.
- Keep ThemeToggle and auth/profile controls visible at 375px without overlap.

### Phase 2: Touch targets

- Add mobile-first height variants to `button.tsx` sizes, `tabs.tsx`, `input.tsx`, `select.tsx` (for example `h-10 sm:h-9`); desktop sizes unchanged. Do not alter variants or colors.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T1.1 | none | site-header.tsx | AC1 | Manual: 375px menu lists Browse, How it works, For providers, Coverage; Tab/Enter/Escape work |
| T1.2 | none | components/ui/{button,tabs,input,select}.tsx | AC6 | Manual: heights >= 40px at 375px; desktop unchanged |
| T1.3 | T1.1, T1.2 | site-header.tsx | AC2 (header) | Manual: no horizontal scroll at 375/768/1280 on / |

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

- Spec: AC1, AC6 (primitives), AC7; AC2 for the header
- Technical: Tailwind classes only; mobile-first (base is mobile, `sm:`/`md:`/`lg:` widen); desktop (>=1024px) appearance unchanged. Accessibility: the menu is labelled and keyboard operable. Rollback: revert the commit.

## Verification

- Routine local checks: `npm run typecheck` and `npm test` (scripts in package.json); `npm run lint` and `npm run build` are also defined but not yet verified in this repo, so record real output. `.agents/rules/project.md` is still the blank template.
- Scoped operations: none.
- Manual: in browser devtools at 375px, 768px and 1280px, load each touched page; confirm no page-level horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`) and controls are >= 40px tall at 375px.

## Expert skills to apply

- none applicable in `.agents/skills/` (only `prompt-master`, used for prompts.md).

## Risks and stop points

- A file has uncommitted changes you did not make: stop and report (AGENTS.md).
- A fix would need a redesign or card layout: stop and record it as a follow-up (D5).
