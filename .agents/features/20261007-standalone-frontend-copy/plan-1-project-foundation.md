---
artifact: plan
schema: 1
feature: 20261007-standalone-frontend-copy
revision: 1
status: plan-approved
risk: quick
---

# Plan 1: Project foundation and frontend contracts

- Feature: `.agents/features/20261007-standalone-frontend-copy/spec.md`
- Design: `.agents/features/20261007-standalone-frontend-copy/design.md`
- Implements decisions: D1, D2, D3, D5
- Spec revision: 1
- Depends on: none
- Status: plan-approved
- Estimate: about 360 lines of diff; split point: move primitive styles into component-level files if the phase exceeds 400 lines

## Goal

Create the isolated Next.js project, SoundStage design tokens, fictional demo model, and replaceable frontend service contract that all later screens use.

## Evidence (checked in the repository)

- `package.json:5`: the parent project uses npm scripts for Next.js development, build, and type checking.
- `package.json:29`: the parent project already uses `lucide-react` for the visual icon vocabulary.
- `package.json:30`: the parent project uses Next.js 16.3.0.
- `package.json:33`: the parent project uses React 19.
- `app/globals.css:61`: the current theme is dark-first.
- `app/globals.css:64`: the current background token is `#121212`.
- `app/globals.css:73`: cyan is the current primary color.
- `lib/client-bookings.ts:28`: current screen components obtain bookings through a service function rather than owning authoritative data.

## Phases

### Phase 1: Standalone application shell

- Add a minimal independent package manifest, TypeScript configuration, Next.js configuration, route layout, metadata, and local redirect from `/` to `/dashboard`.
- Declare only frontend dependencies needed by the copy and do not add Clerk, Supabase, R2, or payment SDKs.
- Add a README with install, start, verification, and backend-adapter instructions.

### Phase 2: Design system foundation

- Define the SoundStage palette, typography, spacing, focus, responsive breakpoints, cards, buttons, fields, badges, skeletons, and dialog layers in local CSS.
- Add small reusable primitives where repeated semantics or accessible behavior justify them.

### Phase 3: Demo contracts and state provider

- Define UI-facing account, booking, message, report, refund, feedback, notification, and dashboard-state types.
- Add fictional seed data and a `FrontendService` contract covering every in-scope action.
- Add a demo service and React provider that simulate latency and safe failures without network requests.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T1.1 | none | `frontend-copy/package.json`, config, `app/layout.tsx`, `app/page.tsx` | AC1, AC12 | Install/start instructions plus typecheck and production build during implementation |
| T1.2 | T1.1 | `frontend-copy/app/globals.css`, shared UI primitives | AC9, AC11 | Source scan for mojibake and manual visual inspection |
| T1.3 | T1.1 | `frontend-copy/lib/*`, service provider | AC10 | Typecheck confirms every demo implementation satisfies `FrontendService` |
| T1.4 | T1.1-T1.3 | `frontend-copy/README.md` | AC1, AC10 | README inspection and documented adapter replacement path |

## Tests

- Standalone module boundaries -> typecheck from inside `frontend-copy/` with no parent-source imports.
- Theme and copy encoding -> source scan plus manual rendering inspection.
- Service contract -> TypeScript structural checking of the demo implementation.

## Out of scope

- Clerk authentication implementation or configuration.
- Supabase clients, queries, migrations, schema, or row-level security.
- Cloudflare R2 upload, storage, credentials, or bucket configuration.
- PayMongo or another payment-provider integration.
- Changes to the existing `app/`, `components/`, `lib/`, or `public/` implementation.
- Deployment, publication, commits, or pushes.

## Acceptance

- Spec: AC1, AC9, AC10, AC11, AC12.
- Technical: all runtime imports resolve within `frontend-copy/`; demo data is fictional; no secret-bearing configuration is introduced.

## Verification

- Routine local checks: none are verified in `.agents/rules/project.md`; implementation must run the new copy's typecheck and production build and report the exact commands.
- Scoped operations: dependency installation writes only inside `frontend-copy/`; request authorization if network access or a new package outside the approved manifest is required.
- Manual: follow README instructions from the standalone directory and inspect the root redirect and base theme.

## Expert skills to apply

- Sites: preserve the established brand, responsive layout, readability, accessibility, and local-only workflow; do not publish.
- prompt-master: not applicable during implementation; used only to prepare `prompts.md`.

## Risks and stop points

- A needed dependency is not already justified by the approved standalone Next.js format -> stop and ask before adding it.
- Any implementation requires importing a parent runtime file -> create a local contract or asset instead; do not weaken AC1 or AC12.
