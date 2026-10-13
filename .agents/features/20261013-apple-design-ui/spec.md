---
artifact: spec
schema: 1
feature: 20261013-apple-design-ui
revision: 2
status: spec-approved
risk: standard
---

# Apple-style UI redesign

- Feature id: 20261013-apple-design-ui
- Revision: 2
- Status: spec-approved
- Risk lane: standard
- Approved by: user, 2026-10-13
- Related decisions: none

## Problem

The platform uses a dark, neon "Soundstage" look (cyan and purple glows, Space
Grotesk display type). The user wants the whole UI to follow Apple's design
language: light, restrained, one accent, system type, frosted surfaces and
generous rounding. This is a visual change only.

Facts found in the code:

- Theme tokens live in `app/globals.css` (`:root` block, dark-only,
  `color-scheme: dark`): background `#121212`, primary `#00e5ff`, accent
  `#b026ff`, `--radius: 0.75rem`, plus `glow-primary` / `glow-accent` utilities.
- Fonts: `app/layout.tsx` loads Inter (`--font-inter`) and Space Grotesk
  (`--font-space-grotesk`) via `next/font/google`; `--font-display` maps to
  Space Grotesk.
- Stack: Tailwind v4 (`@theme inline`), shadcn (`components.json`,
  `shadcn/tailwind.css`), `tw-animate-css`. No animation library.
- 17 files under `app/` and `components/` use `glow-*` or `font-display`.
  No component uses hardcoded hex colour classes; colour flows through tokens.
- Primitives: `components/ui/` (avatar, badge, button, card, dialog, input,
  label, select, separator, switch, tabs, textarea).
- Chrome and landing: `components/site/` (site-header, site-footer, logo,
  package-card, provider-service-detail, star-rating), `components/landing/`
  (hero, sections).
- Auth pages: `app/login`, `app/signup`, `app/forgot-password`,
  `app/reset-password`, `app/verify-otp`, `components/auth/`.
- Dashboards/workspaces: `components/dashboard/`, `components/hubs/`,
  `app/admin`, `app/provider`, `app/client`, `app/payroll-master`.

## Decisions

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | Colour mode | Light by default (ignores OS); a light/dark toggle button switches to dark; choice saved per browser (`localStorage` `soundstage-theme`) | User request 2026-10-13 (rev 2) |
| D2 | Brand accent | Single accent, Apple blue `#0071e3` (dark-mode variant `#0a84ff`); neon cyan, purple and glow utilities removed | Apple relies on one restrained accent |
| D3 | Typography | System stack `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, system-ui, sans-serif`; Space Grotesk removed; Inter kept as fallback | Real SF on Apple devices, no licensing |
| D4 | Surfaces | Frosted translucent (backdrop blur) sticky header and sidebars, soft low-contrast shadows, card radius ≈18px, pill-shaped buttons, Apple neutral greys | Signature Apple surface language |
| D5 | Motion | CSS-only transitions (fade, scale-on-press), disabled under `prefers-reduced-motion` | No new dependency |
| D6 | Scope and order | All surfaces, 4 plans: (1) tokens, fonts, `components/ui` primitives; (2) site chrome + landing; (3) auth pages; (4) dashboards + hubs | Each plan ships independently |

## Out of scope

- Framer Motion or any new animation/UI dependency: rejected (D5).
- Copy, content, layout information architecture, new features: visual only.
- Data, auth, API, schema changes: none.
- Removing Google Maps embeds was done separately at user request (not part of this spec).
- Restyling the `20261007-standalone-frontend-copy` copy and `G2-Sound-Stage/`:
  separate decision (see follow-ups).

## Acceptance criteria

- AC1: THE SYSTEM SHALL render every page with the light theme unless the
  visitor has chosen dark with the toggle, regardless of OS setting.
- AC2: WHEN the visitor presses the theme toggle, THE SYSTEM SHALL switch
  between light and dark immediately and keep the choice on later visits
  without a flash of the other theme; the dark palette is readable on every page.
- AC3: THE SYSTEM SHALL use `#0071e3` (light) / `#0a84ff` (dark) as the only
  accent colour; no `#00e5ff`, `#b026ff`, `glow-primary` or `glow-accent`
  remain in `app/` or `components/`.
- AC4: THE SYSTEM SHALL use the D3 system font stack for body and headings, and
  `app/layout.tsx` SHALL no longer load Space Grotesk.
- AC5: THE SYSTEM SHALL render primary and secondary buttons as pills and cards
  with ≈18px radius and soft shadows.
- AC6: THE SYSTEM SHALL render the site header and dashboard sidebars as
  translucent blurred surfaces, falling back to an opaque background where
  `backdrop-filter` is unsupported.
- AC7: IF the user prefers reduced motion, THEN THE SYSTEM SHALL disable the
  added transitions and press effects.
- AC8: THE SYSTEM SHALL keep all existing behaviour, routes, text and data flows
  unchanged; existing tests and typecheck pass.
- AC9: Plan 2 SHALL restyle the site header, footer and landing page; plan 3
  the auth pages; plan 4 the dashboards and hubs, each matching AC1–AC7.

## Non-functional and operational checks

| Area | Requirement or `not applicable` with reason | Evidence |
| --- | --- | --- |
| Security | not applicable: styling only | diff review |
| Privacy | not applicable: no data handling change | diff review |
| Accessibility | Text/background contrast ≥ WCAG AA (4.5:1 body) in both modes; visible focus rings; reduced motion respected | contrast check of tokens; manual keyboard pass |
| Performance | No new runtime dependencies; one fewer web font | `package.json` diff; build output |
| Observability | not applicable | - |
| Rollback | Revert the plan's commit; plans are independent | git |

## Follow-ups

- Whether the standalone frontend copy (`20261007-standalone-frontend-copy`,
  `G2-Sound-Stage/`) should receive the same redesign.

## Change log

- 2026-10-13: spec approved.
- 2026-10-13: revision 2; changed D1, AC1, AC2, removed toggle from Out of scope; affected plans 1 (tokens), 2 (toggle in site header), 4 (toggle in workspace header); reason: user asked for a light/dark toggle with light default.
