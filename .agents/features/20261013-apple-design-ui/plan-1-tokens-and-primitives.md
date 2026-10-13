---
artifact: plan
schema: 1
feature: 20261013-apple-design-ui
revision: 1
status: plan-approved
risk: standard
---

# Plan 1: Theme tokens, fonts and UI primitives

- Feature: `.agents/features/20261013-apple-design-ui/spec.md`
- Design: none
- Implements decisions: D1, D2, D3, D4, D5
- Spec revision: 2
- Depends on: none
- Status: plan-approved
- Estimate: about 250 lines of diff

## Goal

The Apple palette (light default, OS-driven dark), system font stack, larger
radii, soft shadows, a frosted-surface utility and reduced-motion-safe
transitions exist as tokens, and every `components/ui` primitive uses them.
Pages not yet restyled keep working and already look closer to Apple through tokens.

## Evidence (checked in the repository)

- `app/globals.css:9`: `--font-display` maps to Space Grotesk.
- `app/globals.css:62-118`: single dark-only `:root` palette (`color-scheme: dark`, `#00e5ff`, `#b026ff`, `--radius: 0.75rem`).
- `app/globals.css:127-133`: `glow-primary` / `glow-accent` utilities, used across 16 component/page files.
- `app/layout.tsx:3,14-18,27-30,38`: loads Space_Grotesk; viewport `colorScheme: 'dark'`, `themeColor: '#121212'`.
- `components/ui/button.tsx:8,26-33`: `rounded-lg` base and capped radii per size; `active:translate-y-px`.
- `components/ui/card.tsx:15,28,87`: `rounded-xl`, `ring-1 ring-foreground/10`.
- `components/ui/input.tsx:12`: `h-8 rounded-lg`.
- `components/ui/dialog.tsx:34`: overlay already uses `supports-backdrop-filter:backdrop-blur-xs`.
- `app/globals.css` custom variant `dark` keys off a `.dark` class, not the media query.

## Phases

### Phase 1: Tokens and fonts

- `globals.css` `:root` → Apple light palette, `color-scheme: light dark`: background `#f5f5f7`, card/popover `#ffffff`, foreground `#1d1d1f`, muted `#e8e8ed`, muted-foreground `#6e6e73`, primary/ring `#0071e3`, primary-foreground `#ffffff`, secondary `#e8e8ed`, accent follows primary family, border `rgba(0,0,0,0.08)`, input `rgba(0,0,0,0.12)`, success/warning/destructive from Apple system green/orange/red with AA-safe text shades; charts from Apple system colours; sidebar tokens light.
- Add `@media (prefers-color-scheme: dark) { :root { … } }`: background `#000000`, card `#1c1c1e`, foreground `#f5f5f7`, muted `#2c2c2e`, muted-foreground `#98989d`, primary/ring `#0a84ff`, borders `rgba(255,255,255,0.1)`.
- `--radius: 1.125rem` (≈18px).
- `--font-sans` and `--font-display` both: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", var(--font-inter), system-ui, sans-serif` (keeps `font-display` classes valid until later plans).
- Add `@utility glass` (translucent background + `backdrop-filter: saturate(180%) blur(20px)`, opaque `bg-background` fallback under `@supports not (backdrop-filter: blur(1px))`) and `@utility shadow-soft`.
- Redefine `glow-primary` / `glow-accent` temporarily as the neutral soft shadow; plan 4 deletes them.
- Global `@media (prefers-reduced-motion: reduce)` rule disabling transitions and animations.
- `layout.tsx`: remove Space_Grotesk import/variable; viewport `colorScheme: 'light dark'`, `themeColor` array (light `#f5f5f7`, dark `#000000`).

### Phase 2: Primitives

- `button.tsx`: `rounded-full` base and sizes; `active:scale-[0.97]` replacing `translate-y-px`.
- `card.tsx`: `rounded-2xl` (header/footer to match), `shadow-soft`, ring `ring-black/5` (`ring-white/10` in dark via token).
- `input.tsx`, `textarea.tsx`, `select.tsx` trigger: `rounded-xl`, inputs `h-10`, `bg-card`, blue focus ring.
- `dialog.tsx`: content `rounded-3xl shadow-soft`, overlay `bg-black/30` with existing blur.
- `tabs.tsx`: segmented control (`rounded-full` list on `bg-muted`, active `bg-card shadow-sm`).
- `switch.tsx`: checked `bg-success`, Apple proportions.
- `badge.tsx`, `avatar.tsx`, `separator.tsx`, `label.tsx`: token-only tweaks if needed.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T1.1 | none | `app/globals.css` palettes | AC1, AC2 | manual: OS light/dark on `/`; contrast ratio of each text/background token pair recorded |
| T1.2 | T1.1 | `app/globals.css` fonts, `app/layout.tsx` | AC4 | grep no `Space_Grotesk` in `app/`; manual font check |
| T1.3 | T1.1 | `app/globals.css` reduced-motion | AC7 | manual: devtools "prefers-reduced-motion: reduce" |
| T1.4 | T1.1 | `components/ui/*` | AC5 | manual: pill buttons, card radius/shadow on `/` and `/login` |
| T1.5 | T1.4 | repo | AC8 (partial) | `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` |

## Tests

- No behaviour change; existing suite stays green (`npm test`). Visual checks are manual.

## Out of scope

- From spec: animation dependencies, manual theme toggle, copy/IA changes, data/auth/API changes, standalone frontend copy.
- Page-level components (plans 2–4); deleting glow utilities (plan 4).

## Acceptance

- Spec: AC1, AC2, AC4, AC5, AC7.
- Technical: no new dependencies; `package.json` unchanged.

## Verification

- Routine local checks: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- Scoped operations: none.
- Manual: `npm run dev`; view `/`, `/login`, a dashboard in OS light and dark; tab through a form to see focus rings.

## Expert skills to apply

- none found applicable.

## Risks and stop points

- Pages that assume a dark background (light text on images, `text-white`) may become unreadable in light → list them in the impl report for plans 2–4; do not fix page components here.
- shadcn `dark:` variants use the `.dark` class, so they stay inactive; tokens carry dark mode. If a primitive is unreadable in OS dark, stop and report.

## Revision note (spec revision 2, 2026-10-13)

- D1 changed: dark mode is no longer OS-driven. Dark palette lives under `:root.dark`, light is the default, and `components/site/theme-toggle.tsx` (in site header, client dashboard and hub headers) switches and persists the choice in `localStorage['soundstage-theme']`, applied pre-paint by an inline script in `app/layout.tsx`. Phase 1's `@media (prefers-color-scheme: dark)` instruction is superseded.
- Contrast (review F3, user chose option A): light `--muted-foreground` `#5e5e63`; Apple blue `#0a84ff` kept in dark mode by decision D2.
