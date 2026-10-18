---
artifact: spec
schema: 1
feature: 20261016-responsive-ui
revision: 1
status: spec-approved
risk: standard
---

# Responsive UI

- Feature id: 20261016-responsive-ui
- Revision: 1
- Status: spec-approved
- Risk lane: standard
- Approved by: user, 2026-10-16
- Related decisions: none

## Problem

The user asked that the UI be responsive. Several surfaces assume a desktop width.

Facts found in the code:

- `components/site/site-header.tsx:31` hides the nav with `hidden ... md:flex` and has no mobile menu, so below 768px the Browse, How it works, For providers and Coverage links are unreachable.
- `components/client/client-dashboard.tsx:162` puts the logo, theme toggle, notifications, Browse button and profile menu in one non-wrapping row; the main heading and tab bar are the only parts built for narrow widths (`overflow-x-auto` tabs).
- `components/hubs/hub-workspace.tsx:57` renders tables as `min-w-[680px]` inside `overflow-x-auto`; they scroll sideways on phones. `hub-workspace.tsx` has 17 fixed-width or multi-column grid classes.
- Other files with fixed widths or multi-column grids: `booking-flow.tsx`, `booking-date-picker.tsx`, `services-browser.tsx`, `provider-profile.tsx`, `app/(marketplace)/services/[id]/page.tsx`, `landing/sections.tsx`, `auth/signup-form.tsx`, `payment/*`, `communications/communication-panels.tsx`, `hubs/admin-accounts.tsx`, `hubs/system-activity.tsx`.
- `app/layout.tsx:21` already exports a `viewport`, so no meta change is needed.
- Tailwind is the only styling system (`app/globals.css`, `postcss.config.mjs`).

## Decisions

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | Which widths? | Mobile (~375px), tablet (~768px), desktop (>=1024px) | User choice |
| D2 | Which pages? | All pages, in this order: header/nav; hub, dashboard, admin and payroll tables and grids; booking, browse, service detail; auth and landing | User choice |
| D3 | How? | Tailwind classes only. No new dependencies. No redesign; the Apple-style look stays | User choice |
| D4 | Mobile nav pattern | Header gets a menu button below `md` that opens the same links. Reuses existing UI primitives where available | Smallest change that restores navigation |
| D5 | Wide tables on mobile | Keep horizontal scroll inside the table container; the page itself never scrolls sideways | Lowest risk; card layouts are a redesign |

## Out of scope

- Visual redesign, new colors, new components beyond a mobile menu: D3.
- Behavior, data or API changes.
- Native app or PWA work.
- Card-style table layouts on mobile: D5.

## Acceptance criteria

- AC1: WHILE the viewport is below 768px, THE SYSTEM SHALL show a menu control in the site header that exposes every link the desktop nav shows.
- AC2: THE SYSTEM SHALL NOT produce horizontal page scroll at 375px, 768px or 1280px on any page.
- AC3: WHILE the viewport is 375px wide, THE SYSTEM SHALL keep the client dashboard header controls on screen without overlap.
- AC4: WHILE the viewport is below 768px, THE SYSTEM SHALL stack multi-column grids on hub, dashboard, booking, browse, service detail, auth and landing pages into one column (or two where content is short).
- AC5: WHEN a table is wider than the viewport, THE SYSTEM SHALL scroll it inside its own container.
- AC6: THE SYSTEM SHALL keep interactive controls at least 40px tall on touch widths.
- AC7: THE SYSTEM SHALL pass typecheck and the existing test suite unchanged in behavior.

## Non-functional and operational checks

| Area | Requirement or `not applicable` with reason | Evidence |
| --- | --- | --- |
| Security | not applicable: styling only | - |
| Privacy | not applicable | - |
| Accessibility | Mobile menu is keyboard operable and labelled | Manual check |
| Performance | No new dependencies or bundles | package.json diff empty |
| Observability | not applicable | - |
| Rollback | Revert the commits | git |

## Follow-ups

- Card layouts for tables on mobile, if horizontal scroll proves poor in use.

## Change log

- 2026-10-16: spec approved.
