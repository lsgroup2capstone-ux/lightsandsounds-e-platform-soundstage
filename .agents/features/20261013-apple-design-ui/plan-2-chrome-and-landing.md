---
artifact: plan
schema: 1
feature: 20261013-apple-design-ui
revision: 1
status: plan-approved
risk: standard
---

# Plan 2: Site chrome, landing, browse and booking surfaces

- Feature: `.agents/features/20261013-apple-design-ui/spec.md`
- Design: none
- Implements decisions: D2, D4, D5, D6
- Spec revision: 1
- Depends on: plan 1
- Status: plan-approved
- Estimate: about 300 lines of diff; split point: Phase 2

## Goal

Public pages look Apple-like: frosted sticky header, quiet footer, large centred
hero, roomy sections, pill CTAs, rounded image cards; service detail, booking
and payment surfaces match. No glow or `font-display` neon styling remains in these files.

## Evidence (checked in the repository)

- `components/site/site-header.tsx:28`: sticky header `bg-background/80 backdrop-blur-xl`.
- Glow/`font-display` hits: `components/site/logo.tsx` (1), `site-header.tsx` (2), `package-card.tsx` (2), `components/landing/hero.tsx` (2), `components/landing/sections.tsx` (7), `app/services/[id]/page.tsx:110,184`, `components/booking/booking-flow.tsx:185,336,363`, `components/payment/payment-receipt.tsx:10`.
- `components/site/provider-service-detail.tsx:24`: service detail layout, `rounded-2xl` cards.
- `components/landing/hero.tsx:24`: pill badge with `backdrop-blur`.

## Phases

### Phase 1: Chrome and landing

- Header: `glass` utility, ~52px height, nav links `text-sm text-foreground/80`, pill CTA.
- Footer: `bg-muted` band, `text-xs` muted columns, hairline separators.
- Logo: no glow; system-font semibold wordmark.
- Hero: centred, `text-5xl md:text-7xl font-semibold tracking-tight`, muted subhead, filled blue pill + text link "›" CTA.
- Sections: alternating `bg-background` / `bg-card` bands, `py-24`, `rounded-3xl shadow-soft` cards.
- `package-card.tsx`, `star-rating.tsx`: `rounded-2xl` image, `motion-safe:hover:-translate-y-0.5`.

### Phase 2: Service, browse, booking and payment

- `provider-service-detail.tsx`, `app/services/[id]/page.tsx`, `app/browse`, `app/listed-services`: card/pill styling, no glow.
- `booking-flow.tsx`, `payment-receipt.tsx`, `app/payment`: rounded sections, Apple price emphasis, no glow.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T2.1 | plan 1 | `components/site/site-header.tsx`, `logo.tsx`, `site-footer.tsx` | AC6 (header) | manual: scroll `/`, header blurs content; opaque fallback with backdrop-filter disabled in devtools |
| T2.2 | plan 1 | `components/landing/*`, `package-card.tsx`, `star-rating.tsx` | AC9 (plan 2) | manual `/` light + dark |
| T2.3 | T2.2 | service/browse/booking/payment files above | AC9 (plan 2) | manual `/browse`, `/services/[id]`, booking dialog |
| T2.4 | T2.3 | repo | AC8 (partial) | `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`; grep no `glow-` in touched files |

## Tests

- Existing suite stays green; visual checks manual.

## Out of scope

- From spec: animation dependencies, manual theme toggle, copy/IA changes, data/auth/API changes, standalone frontend copy.
- Auth pages (plan 3), dashboards/hubs (plan 4), booking logic.

## Acceptance

- Spec: AC6 (header), AC9 (plan 2 surfaces).
- Technical: class-only edits; no text, route or prop changes.

## Verification

- Routine local checks: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- Scoped operations: none.
- Manual: `/`, `/browse`, a service page, booking dialog, OS light and dark, 375px and desktop.

## Expert skills to apply

- none found applicable.

## Risks and stop points

- `booking-flow.tsx` is also in scope of booking-schedule plans → run `git status`; if it has changes you did not make, stop and report.
