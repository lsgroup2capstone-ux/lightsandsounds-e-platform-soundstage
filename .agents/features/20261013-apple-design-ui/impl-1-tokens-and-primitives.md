---
artifact: implementation
schema: 1
feature: 20261013-apple-design-ui
plan: 1
status: ready-for-review
---

# Implementation 1: Theme tokens, fonts and UI primitives

- Plan: `.agents/features/20261013-apple-design-ui/plan-1-tokens-and-primitives.md` (spec revision 1)
- Date: 2026-10-13
- Scope: whole plan (Phases 1 and 2)

## Files changed

- `app/globals.css`: font tokens now system stack (SF first, Inter fallback); dark neon `:root` replaced by Apple light palette plus `@media (prefers-color-scheme: dark)` palette; `--radius: 1.125rem`; new `--glass-bg`, `--shadow-soft` tokens; `glass` and `shadow-soft` utilities (opaque fallback via `@supports not (backdrop-filter)`); `glow-primary`/`glow-accent` redefined as neutral soft shadow (temporary, removed in plan 4); body antialiasing and slight negative tracking; global `prefers-reduced-motion` rule.
- `app/layout.tsx`: Space_Grotesk removed; viewport `colorScheme: 'light dark'`, `themeColor` per scheme.
- `components/ui/button.tsx`: pill radius on all sizes, `scale-[0.97]` press, taller sizes (default h-9, lg h-11), primary hover.
- `components/ui/card.tsx`: `rounded-2xl`, `shadow-soft`, lighter ring, spacing 5.
- `components/ui/input.tsx`, `textarea.tsx`, `select.tsx`: `rounded-xl`, `bg-card`, h-10 inputs/triggers, rounded-xl popup.
- `components/ui/dialog.tsx`: `rounded-3xl`, `p-6`, `shadow-soft`, overlay `bg-black/30` + `backdrop-blur-sm`.
- `components/ui/tabs.tsx`: segmented-control pill list and triggers.
- `components/ui/switch.tsx`: checked track `bg-success` (Apple green).
- Not changed (no need): badge (already `rounded-4xl`), avatar, separator, label.

## Deviations from the plan

- None in approach. Light-mode success/warning/destructive use darker Apple shades (`#248a3d`, `#b25000`, `#d70015`) so white text on them meets AA; dark mode uses the bright system colours.

## Checks (run in this session)

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | pass (exit 0) |
| `npm run lint` | **could not run**: `'eslint' is not recognized` — ESLint is not installed in `node_modules`; pre-existing, not caused by this plan |
| `npm test` | pass: 93 tests, 93 pass, 0 fail |
| `npm run build` | pass (exit 0) |
| grep `Space_Grotesk\|font-space-grotesk` in `app`, `components` | no matches |

## Acceptance evidence

| AC | Evidence | Status |
| --- | --- | --- |
| AC1 | light palette is the default `:root` | code done; **manual visual check not done** |
| AC2 | dark palette under `prefers-color-scheme: dark` | code done; **manual visual check not done** |
| AC4 | system font stack in `--font-sans`/`--font-display`; Space Grotesk gone (grep) | done |
| AC5 | button `rounded-full`, card `rounded-2xl` (≈18px via radius 1.125rem scale) + `shadow-soft` | code done; manual check not done |
| AC7 | global reduced-motion rule in `globals.css` | code done; manual devtools check not done |

## Not done / for the reviewer

- No browser visual pass was performed; the reviewer or user should run `npm run dev` and view `/`, `/login`, `/admin` in OS light and dark.
- Contrast ratios were chosen from Apple's published system colours, not measured with a tool.
- Pages still using `text-white` or dark-only assumptions were not audited; that is plans 2–4.

## Unrelated issues noticed

- `npm run lint` fails because ESLint is not installed (missing devDependency).
- Working tree already contained unrelated uncommitted changes (`login-form.tsx`, `hub-workspace.tsx`, `client-dashboard.tsx`, `admin-accounts.tsx`, `lib/client-auth.ts`, `lib/hub-data.ts`, `tests/clerk-password.cjs`, deleted `app/payroll-master/page.tsx`, `clear-app-data-button.tsx`); untouched.

## Follow-up changes (user requests, 2026-10-13, spec revision 2)

- Light/dark toggle: dark palette moved from `@media (prefers-color-scheme: dark)` to `:root.dark`; `@custom-variant dark` now `&:where(.dark, .dark *)`; `:root` `color-scheme: light`; `app/layout.tsx` adds a pre-paint inline script reading `localStorage['soundstage-theme']` and `suppressHydrationWarning`, viewport light only; new `components/site/theme-toggle.tsx` (Moon/Sun ghost icon button, `aria-pressed`), placed in `components/site/site-header.tsx`. Plan 1 text still describes OS-driven dark; reviewer should check against spec rev 2.
- Maps: all Google Maps iframes removed (`provider-service-detail.tsx`, `client-dashboard.tsx`, `hub-workspace.tsx`), replaced by area-name pills; client label "coverage maps" → "coverage areas". `ThemeToggle` also added to client dashboard and hub workspace headers (user approved editing these files despite pre-existing changes).
- Checks after these changes: `npx tsc --noEmit` exit 0; `npm test` 93/93 pass; `npm run build` exit 0. No browser check done.

## Fix round 1 (review-1 findings)

- F1 fixed: radii now follow the `--radius` (18px) scale — card/header/footer/images `rounded-lg` (18px); input, textarea, select trigger and popup `rounded-md` (≈14px), small select `rounded-sm`; dialog `rounded-xl` (≈25px).
- F4 no change: `tabsListVariants` default variant already applies `bg-muted` (`components/ui/tabs.tsx:30`).
- F5 fixed: `theme-toggle.tsx` listens to the `storage` event and syncs theme across tabs.
- F2 not changed by implementer (plan file is the planner's artifact).
- F3 awaiting user decision (accent contrast vs D2).
- Checks: `npx tsc --noEmit` exit 0; `npm test` 93/93 pass; `npm run build` exit 0.
- F3 (user chose A): light `--muted-foreground` `#6e6e73` → `#5e5e63`; dark blue unchanged per D2. F2: plan 1 updated to spec revision 2 with a revision note (planner action, user-approved).
