---
artifact: review
schema: 1
feature: 20261013-apple-design-ui
revision: 2
status: approved
risk: standard
---

# Review 1: Theme tokens, fonts and UI primitives

- Plan: `plan-1-tokens-and-primitives.md` (written for spec rev 1; judged against spec rev 2)
- Spec: `spec.md` (revision 2)
- Reviewer: fresh reviewer subagent (Claude Code)
- Independent from implementation: yes
- Baseline: HEAD `250f672` (uncommitted working tree)
- Diff scope: `app/globals.css`, `app/layout.tsx`, `components/ui/{button,card,dialog,input,select,switch,tabs,textarea}.tsx`, `components/site/theme-toggle.tsx` (new), `components/site/site-header.tsx`, `components/site/provider-service-detail.tsx`, and only the map/ThemeToggle lines of `components/dashboard/client-dashboard.tsx` and `components/hubs/hub-workspace.tsx` (other pre-existing changes in those files not judged)

## Round 1 (2026-10-13)

- Scope reviewed: all (Phases 1-2 plus follow-up toggle and map removal)
- Verdict: changes-requested

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | pass (exit 0) |
| `npm run lint` | not run: ESLint not installed (pre-existing, known) |
| `npm test` | pass: 93 tests, 93 pass, 0 fail |
| `npm run build` | pass (exit 0) |
| `git diff --quiet package.json` | unchanged (no new deps) |
| grep `00e5ff|b026ff` in `app`, `components` | no matches |
| grep `iframe|google.com/maps` in `app`, `components` | no matches |

### Acceptance

| Criterion | Met? | Evidence |
| --- | --- | --- |
| AC1 light default regardless of OS | yes (code) | `app/globals.css:60-118` light `:root`, `color-scheme: light`; dark only under `:root.dark`; `app/layout.tsx:22-23` viewport light. Browser check not done |
| AC2 toggle, persisted, no flash | yes (code) | `components/site/theme-toggle.tsx` toggles `.dark` + `localStorage['soundstage-theme']`; pre-paint script `app/layout.tsx:33-39`; `@custom-variant dark` `app/globals.css:5`. Toggle in header `components/site/site-header.tsx:44`, `client-dashboard.tsx:162`, `hub-workspace.tsx:363`. Dark readability on every page not verified in a browser |
| AC3 single accent (token level) | partial, as planned | tokens use `#0071e3`/`#0a84ff`; neon hex gone; `glow-*` utilities remain as neutral stand-ins (`app/globals.css` end) for plan 4 to delete |
| AC4 system font, no Space Grotesk | yes | `app/globals.css:8-9`; `app/layout.tsx:3` |
| AC5 pill buttons, ≈18px cards, soft shadows | **no (cards)** | buttons `rounded-full` `components/ui/button.tsx:8`; card uses `rounded-2xl` = `--radius*1.8` ≈ 32px (`app/globals.css:57`, `components/ui/card.tsx:15`), see F1 |
| AC6 | n/a plan 1 (utility `glass` with opaque fallback exists, `app/globals.css`) | |
| AC7 reduced motion | yes (code) | global `@media (prefers-reduced-motion: reduce)` in `app/globals.css`; devtools check not done |
| AC8 behaviour unchanged, tests/typecheck | yes (checks) | tsc, test, build pass; map iframe removal is a user-requested exception recorded in spec Out of scope |

### Traceability

| Task | Test/evidence | Result |
| --- | --- | --- |
| T1.1 palettes | code review; contrast computed by reviewer (F3) | met (code), manual pending |
| T1.2 fonts | grep, diff | met |
| T1.3 reduced motion | code | met (code), manual pending |
| T1.4 primitives | diff | not met (F1) |
| T1.5 checks | tsc/test/build pass; lint unavailable | met |

### Findings

| # | Severity | Finding | Where | Required fix |
| --- | --- | --- | --- | --- |
| F1 | major | Card radius is ≈32px, not ≈18px: `--radius` is 1.125rem but `rounded-2xl` maps to `--radius-2xl = calc(var(--radius)*1.8)`. Inputs/select `rounded-xl` likewise ≈25px; dialog `rounded-3xl` falls back to Tailwind's 24px and is now smaller than cards. | `components/ui/card.tsx:15,28,87`; `app/globals.css:53-57`; `components/ui/input.tsx`, `select.tsx`, `textarea.tsx`, `dialog.tsx` | Use `rounded-lg` (= `--radius` = 18px) for card/header/footer and images, or rescale the `--radius-*` steps so the class used for cards resolves to ≈18px; make inputs/dialog radii consistent with that scale. |
| F2 | minor | Plan 1 still states spec revision 1 and OS-driven dark (`prefers-color-scheme`), contradicting spec rev 2 D1; the implementation follows rev 2. | `plan-1-tokens-and-primitives.md` header, Phase 1, Out of scope | Planner updates plan 1 to spec rev 2 (class-based dark, toggle, light-only viewport). |
| F3 | minor | Contrast: white on dark-mode primary `#0a84ff` is ≈3.7:1 (below AA 4.5:1 for 14px button text); light `--muted-foreground #6e6e73` on `--muted #e8e8ed` ≈4.2:1. Accent hex is fixed by D2. | `app/globals.css` `:root.dark --primary-foreground`, `:root --muted` | Record measured ratios; if AA must hold, raise to the user (D2 vs NFR) rather than silently change. |
| F4 | minor | Tabs list has no `bg-muted` in its own classes, so the "segmented control" track relies on callers. | `components/ui/tabs.tsx` tabs-list variants | Confirm the default variant supplies `bg-muted`; add it if not. |
| F5 | minor | `ThemeToggle` does not sync across tabs or react to storage changes; acceptable but undocumented. | `components/site/theme-toggle.tsx` | Optional: listen to `storage` event. |

### Unverified (manual)

- Browser pass of `/`, `/login`, `/dashboard`, a hub in light and dark (toggle, reload persistence, no flash).
- Reduced-motion devtools emulation.
- Keyboard focus ring pass.

### Scope check

- Changes outside the plan: ThemeToggle and map-iframe removal in `site-header.tsx`, `provider-service-detail.tsx`, `client-dashboard.tsx`, `hub-workspace.tsx` — user-requested (spec rev 2 / Out of scope note); accepted. Unrelated pre-existing edits in those files not judged.

## Round 2 (2026-10-13)

- Scope reviewed: fix round 1 (F1-F5) against spec rev 2 and plan 1 with rev-2 revision note
- Reviewer: fresh reviewer subagent; independent from implementation: yes
- Verdict: pass

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | pass (exit 0) |
| `npm run lint` | not run: ESLint not installed (pre-existing, known) |
| `npm test` | pass: 93 tests, 93 pass, 0 fail |
| `npm run build` | pass (exit 0) |
| `git diff --quiet package.json` | unchanged |
| grep `00e5ff|b026ff|iframe|google.com/maps` in `app`, `components` | no matches |

### Findings status

| # | Status | Evidence |
| --- | --- | --- |
| F1 | resolved | `--radius-lg: var(--radius)` = 18px (`app/globals.css:55`); card/header/footer/images `rounded-lg` (`components/ui/card.tsx:15,28,87`); input/textarea/select `rounded-md` ≈14px (`input.tsx:12`, `textarea.tsx:10`, `select.tsx:44,86`); dialog `rounded-xl` ≈25px (`dialog.tsx:56,105`) — consistent scale, dialog > card. AC5 met (code). |
| F2 | resolved | Plan 1 "Revision note (spec revision 2)" (`plan-1-tokens-and-primitives.md:101-104`). |
| F3 | resolved per user decision A | light `--muted-foreground: #5e5e63` (`app/globals.css:80`) on `--muted #e8e8ed` ≈5.2:1 (AA); dark `#0a84ff` kept per D2 (accepted, not re-litigated). |
| F4 | no change needed | `tabsListVariants` default `bg-muted` (`components/ui/tabs.tsx:31`). |
| F5 | resolved | `storage` listener with cleanup (`components/site/theme-toggle.tsx:12-22`). |

### New findings

| # | Severity | Finding | Where | Required fix |
| --- | --- | --- | --- | --- |
| F6 | minor | Helper text still says "Maps display city/town names only…" though maps were replaced by chips. | `components/hubs/hub-workspace.tsx` (serviceLocation field) | Optional wording fix in a later plan (e.g. "Only city/town names are shown"). |

### Unverified (manual)

- Browser pass in light/dark (toggle, reload persistence, no flash, cross-tab sync), reduced-motion emulation, keyboard focus ring pass.

### Scope check

- ThemeToggle/map lines in `client-dashboard.tsx` and `hub-workspace.tsx` limited to toggle insertion and iframe-to-chip replacement; other pre-existing changes in those files not judged.
