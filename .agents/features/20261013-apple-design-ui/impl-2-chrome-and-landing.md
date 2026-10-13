---
artifact: implementation
schema: 1
feature: 20261013-apple-design-ui
plan: 2
status: ready-for-review
---

# Implementation 2: Site chrome, landing, browse and booking surfaces

- Plan: `.agents/features/20261013-apple-design-ui/plan-2-chrome-and-landing.md` (spec revision 2)
- Date: 2026-10-13
- Scope: whole plan (Phases 1 and 2); 13 files, 87 insertions / 90 deletions

## Files changed

- `components/site/site-header.tsx`: `glass` utility, h-14, 13px nav text, glow removed, button heights aligned.
- `components/site/logo.tsx`: monochrome mark (`bg-foreground text-background`), single-word "SoundStage" semibold, no `font-display`/accent split.
- `components/site/site-footer.tsx`: `bg-muted/60` band, xs type, tighter lists, hover underline.
- `components/landing/hero.tsx`: neon radial gradient removed, dimmer image, larger semibold headline (5xl/7xl), muted second clause, filled pill + link-style secondary CTA, glow removed.
- `components/landing/sections.tsx`: eyebrow labels in primary (no uppercase), 4xl/5xl semibold headings, py-24 bands, borderless cards, round icon wells; Coverage neon gradients and hardcoded `#f5f5f5` grid replaced with token-based grid; ping animation `motion-safe`; ProviderCta purple accent/glow replaced with card + shadow-soft and default button.
- `components/site/package-card.tsx`: rounded-lg card, shadow-soft + ring, motion-safe hover lift (cyan glow shadow removed), image overlay gradient removed, premium badge monochrome.
- `app/services/[id]/page.tsx`, `components/site/provider-service-detail.tsx`: borderless shadowed cards, radii on the 18px scale, semibold headings, premium badge monochrome.
- `components/booking/booking-flow.tsx`: `font-display` removed, summary panels `bg-muted/60`, larger price, outline buttons default border.
- `components/payment/payment-receipt.tsx`: plain "SoundStage" wordmark, shadowed card, amount in foreground.
- `app/browse/page.tsx`, `components/browse/services-browser.tsx`: Apple-style page header (no mono uppercase eyebrow), empty state card.
- `app/payment/return/page.tsx`: heading weight/size.

## Deviations from the plan

- `star-rating.tsx`, `app/listed-services/[id]/page.tsx`, `booking-date-picker.tsx`, `payment-method-picker.tsx` needed no change (no glow/neon; they inherit tokens).
- `components/browse/services-browser.tsx` was not named in the plan but is the body of `/browse` (T2.3 area); one class string changed.
- Copy: no text changes (user chose to revert "View details ›" and the receipt wordmark, review-2 F1); hero clause colour only.
- Fix round (review-2): F2 report corrected; F3 indentation fixed in `package-card.tsx:34`; F5 plan header updated to spec revision 2.

## Checks (run in this session)

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | pass (exit 0) |
| `npm test` | pass: 93/93 |
| `npm run build` | pass (exit 0) |
| `npm run lint` | not run: ESLint not installed (known) |
| grep `glow-`, `font-display`, neon rgba, `text-accent`/`bg-accent` in plan 2 files | no matches |

## Acceptance evidence

| AC | Evidence | Status |
| --- | --- | --- |
| AC6 (header) | `site-header.tsx` uses `glass` (opaque fallback in `globals.css` `@supports not`) | code done; browser check not done |
| AC9 (plan 2 surfaces) | files above restyled; no glow/neon left in them | code done; browser check not done |

## Not done / for the reviewer

- No browser visual pass (light + dark, 375px and desktop) was performed.
- `rounded-xl`/`2xl` usages in pages outside plan 2 still resolve to the larger 25/32px steps; plans 3–4 handle their files.
