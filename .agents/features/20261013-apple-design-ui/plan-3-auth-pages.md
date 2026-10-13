---
artifact: plan
schema: 1
feature: 20261013-apple-design-ui
revision: 1
status: plan-approved
risk: standard
---

# Plan 3: Auth pages

- Feature: `.agents/features/20261013-apple-design-ui/spec.md`
- Design: none
- Implements decisions: D2, D4, D5, D6
- Spec revision: 2
- Depends on: plan 1
- Status: plan-approved
- Estimate: about 120 lines of diff

## Goal

Login, sign-up, OTP, forgot and reset password pages look like an Apple ID
sign-in: centred narrow card on a light grey field, large title, full-width
pill submit, no glow.

## Evidence (checked in the repository)

- `components/auth/auth-shell.tsx` (61 lines, 2 glow/`font-display` hits): shared layout for auth pages.
- Hits: `login-form.tsx` (2), `otp-form.tsx` (2), `signup-form.tsx` (1), `forgot-password-form.tsx` (1), `reset-password-form.tsx` (1).
- `components/auth/login-form.tsx` had uncommitted changes not from this feature (git status, 2026-10-13).
- Routes: `app/login`, `app/signup`, `app/verify-otp`, `app/forgot-password`, `app/reset-password`.

## Phases

### Phase 1: Shell and forms

- `auth-shell.tsx`: centred `max-w-sm` card, `rounded-3xl shadow-soft bg-card`, logo above, `text-3xl font-semibold` title, muted subtitle; drop decorative glow.
- Forms: class-only edits; full-width `size="lg"` pill submit; OTP boxes `rounded-xl`; links in accent blue.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T3.1 | plan 1 | `components/auth/auth-shell.tsx` | AC9 (plan 3) | manual `/login` light + dark |
| T3.2 | T3.1 | `components/auth/*-form.tsx` | AC9 (plan 3) | manual each auth route |
| T3.3 | T3.2 | repo | AC8 (partial) | `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` |

## Tests

- Existing auth tests (`tests/clerk-password.cjs`, `tests/signup-sms.cjs`, etc. in `npm test`) stay green.

## Out of scope

- From spec: animation dependencies, manual theme toggle, copy/IA changes, data/auth/API changes, standalone frontend copy.
- Any Clerk or auth logic.

## Acceptance

- Spec: AC9 (plan 3 surfaces).
- Technical: no handler, logic or text changes.

## Verification

- Routine local checks: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- Scoped operations: none.
- Manual: each auth page renders, keyboard focus visible, error states readable in both modes.

## Expert skills to apply

- none found applicable.

## Risks and stop points

- Pre-existing uncommitted changes in `login-form.tsx` → stop and ask the user before editing.
