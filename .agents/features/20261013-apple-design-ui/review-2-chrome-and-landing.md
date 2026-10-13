---
artifact: review
schema: 1
feature: 20261013-apple-design-ui
revision: 2
status: pass
risk: standard
---

# Review 2: Site chrome, landing, browse and booking surfaces

- Plan: `plan-2-chrome-and-landing.md`
- Spec: `spec.md` (revision 2)
- Reviewer: fresh reviewer agent (Claude Code subagent)
- Independent from implementation: yes
- Baseline: 243d521 (HEAD; plan 1 shipped)
- Diff scope: working tree, 13 paths: `components/site/{site-header,logo,site-footer,package-card,provider-service-detail}.tsx`, `components/landing/{hero,sections}.tsx`, `app/services/[id]/page.tsx`, `components/booking/booking-flow.tsx`, `components/payment/payment-receipt.tsx`, `app/browse/page.tsx`, `components/browse/services-browser.tsx`, `app/payment/return/page.tsx` (87+/90-). Other modified files in the tree are unrelated pre-existing work and were not reviewed.

## Round 1 (2026-10-13)

- Scope reviewed: all (Phases 1 and 2)
- Verdict: pass

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | pass (exit 0) |
| `npm run lint` | not run: ESLint not installed (known, pre-existing) |
| `npm test` | pass: 93/93, 0 fail |
| `npm run build` | pass (exit 0) |
| grep `glow`, `font-display`, `rgba`, hex colours in the 13 files | no matches |

### Acceptance

| Criterion | Met? | Evidence |
| --- | --- | --- |
| AC3 (plan 2 files) | yes | `glow-primary` removed `site-header.tsx:45,50`, `hero.tsx:34`; `glow-accent`/`bg-accent` removed `sections.tsx:169`; neon radial gradients removed `hero.tsx`, `sections.tsx:125,157` |
| AC5 | yes | cards `rounded-lg`/`rounded-xl` + `shadow-soft` (`package-card.tsx:24`, `services/[id]/page.tsx:108,131`, `sections.tsx:157`) |
| AC6 (header) | code yes; browser unverified | `site-header.tsx:29` uses `glass` (fallback from plan 1 `globals.css`) |
| AC7 | yes | `sections.tsx:135` `motion-safe:animate-ping`; `package-card.tsx:24` `motion-safe:hover:-translate-y-0.5` |
| AC8 | yes, with declared copy deviation (F1) | diff is className-only except F1 / receipt wordmark; no logic, route, prop or handler changes; tsc/test/build pass |
| AC9 (plan 2) | code yes; browser unverified | header, footer, landing, service, browse, booking, payment files restyled |
| Light/dark readability | yes by inspection | all colours are tokens; hardcoded `#f5f5f5` grid replaced by `var(--foreground)` (`sections.tsx:127`); hero image dimmed to 25% under `from-background` gradient so text sits on background token in both modes; image badges use `bg-card/85 text-foreground` or `bg-foreground text-background` (both invert correctly) |

### Traceability

| Task | Test/evidence | Result |
| --- | --- | --- |
| T2.1 | diff of header/logo/footer; manual scroll check not done | met (code) |
| T2.2 | diff of landing + package-card; star-rating needed no change | met (code) |
| T2.3 | diff of service/browse/booking/payment files | met (code) |
| T2.4 | tsc, test, build pass; grep clean; lint not runnable | met |

### Findings

| # | Severity | Finding | Where | Required fix |
| --- | --- | --- | --- | --- |
| F1 | minor | Visible text changed despite AC8 / plan "no text changes": "View details" -> "View details ›"; receipt wordmark "SOUND STAGE" (two-tone caps) -> "SoundStage". Both declared in impl report. | `components/site/package-card.tsx:65`; `components/payment/payment-receipt.tsx:10` | Either revert the chevron, or have the user accept it as a visual glyph. Receipt wordmark matches the logo; accept or revert. |
| F2 | minor | Impl report says "View all" gained a "›" chevron; it did not. | `components/landing/sections.tsx:78`; impl report "Deviations" | Correct the impl report (no code change needed). |
| F3 | minor | Misindented line after removing the overlay gradient. | `components/site/package-card.tsx:34` | Fix indentation. |
| F4 | minor | Hero's second clause now `text-muted-foreground` at 5xl/7xl; ok for large text but verify contrast on top of the dimmed image in dark mode. | `components/landing/hero.tsx:28` | Check during the browser pass. |
| F5 | minor | Plan header still cites spec revision 1; spec is revision 2 (toggle shipped in plan 1, so no plan-2 content gap). | plan-2 header | Bump plan's spec revision reference when convenient. |

Severity: blocker = breaks a decision, security or data; major = acceptance not
met or wrong behavior; minor = style or small risk (does not block `pass`).

### Unverified manual checks

- Browser pass: `/`, `/browse`, a service page, booking dialog, payment return; light and dark; 375px and desktop; header blur and opaque fallback; keyboard focus rings. Not performed by implementer or reviewer.

### Scope check

- Changes outside the plan: `components/browse/services-browser.tsx` (one class string, body of `/browse`, declared). `booking-flow.tsx` changes are className-only; no overlap with booking-schedule logic.
