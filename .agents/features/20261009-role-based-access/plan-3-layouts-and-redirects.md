---
artifact: plan
schema: 1
feature: 20261009-role-based-access
revision: 1
status: plan-approved
risk: high-risk
---

# Plan 3: Section layouts, dashboard router, and sign-in redirects

- Feature: `.agents/features/20261009-role-based-access/spec.md`
- Design: `.agents/features/20261009-role-based-access/design.md`
- Implements decisions: D5 (layout half), D6, D7 (sign-in half), D8, D9, D16 (page half)
- Spec revision: 3
- Depends on: plan 2
- Status: plan-approved
- Estimate: about 260 lines of diff

## Goal

Each of `/client`, `/provider`, `/payroll-master`, `/admin` has a server layout that authorizes from `profiles` through `requireRole`; `/payroll-master` shows a placeholder; `/dashboard` routes each user to their dashboard; sign-in and signup completion go through `/dashboard?returnTo=…` so `returnTo` is honored only when allowed; and `/login` announces suspended, deactivated, and unavailable states.

## Evidence (checked in the repository)

- `app/dashboard/page.tsx:9-13`: renders `ClientDashboard` for any visitor (D9 changes it).
- `app/client/page.tsx`, `app/provider/[[...slug]]/page.tsx`, `app/admin/[[...slug]]/page.tsx`: no layouts exist in these folders.
- `components/auth/login-form.tsx:13,20,30`: client-side `returnTo` check and `destinationFor` (client → `/browse`); the spec makes the client dashboard `/client`.
- `app/auth/clerk/complete/page.tsx:24-27`: destination from `sessionStorage` `soundstage-google-return-to`; unapproved providers go to `/provider/application`.
- `app/login/page.tsx:8-14`: reads `returnTo` and `reset` search params; place for status messages.
- `app/payment/return/page.tsx:13,22`, `components/booking/booking-flow.tsx:388`, `components/site/site-header.tsx:45`, `components/auth/otp-form.tsx:11`: existing links to `/dashboard` and `/dashboard?tab=…` that must keep working for clients (preserve `tab`).
- `components/hubs/hub-workspace.tsx:349`, `components/dashboard/client-dashboard.tsx:140-147`: client-side checks stay (out of scope to change page content).

## Phases

### Phase 1: Layouts and pages

- `app/client/layout.tsx`, `app/provider/layout.tsx`, `app/payroll-master/layout.tsx`, `app/admin/layout.tsx`: `export const dynamic = "force-dynamic"`; `const decision = await requireRole("<role>")`; render `children` only on `allow`; render `<AccessRefresh to=… />` on `refresh`; render a `role="alert"` message with a "Try again" link on `error`/`unavailable`. Redirect kinds are handled inside `requireRole`.
- `app/payroll-master/page.tsx`: placeholder heading "Payroll master" and one sentence that payroll tools are coming (AC20).
- `components/auth/access-refresh.tsx` (client): `role="status"` "Updating your access…"; `await (await getClerkBrowser()).session?.getToken({ skipCache: true })`, then `location.replace(to)`.
- `app/dashboard/page.tsx`: server router. Uses `getCurrentProfile`: signed out → `/login`; no profile → `/auth/clerk/complete`; non-active → same sign-out path as layouts; `returnTo` passing `safeReturnTo` and `canAccessPath(role, path)` → there; else `dashboardFor(role)`, appending `?tab=<tab>` when the role is `client` and `tab` is present. Logic lives in an exported `routeDashboard(...)` in `lib/server/access.ts` for testing.

### Phase 2: Sign-in redirects and messages

- `components/auth/login-form.tsx`: `destinationFor` returns `/dashboard` plus `?returnTo=<encoded>` when a `returnTo` was given; remove the client-side `returnTo` check (the server decides). Signup link keeps passing `returnTo`.
- `app/auth/clerk/complete/page.tsx`: read `returnTo` from the query string first, then the existing session key; keep the unapproved-provider branch; otherwise `location.replace("/dashboard" + (returnTo ? "?returnTo=" + encodeURIComponent(returnTo) : ""))`.
- `app/login/page.tsx`: accept `status`; for `suspended`/`deactivated` show `<p role="alert">This account is suspended.</p>` / `deactivated.` above the form (AC17 text exactly).

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T3.1 | plan 2 | four `layout.tsx` files, `components/auth/access-refresh.tsx` | AC12, AC16, AC18, AC21 | `tests/access.cjs` cases from plan 2 cover the decisions; add a source check in `tests/access.cjs` that each layout calls `requireRole` with its own role and contains no role comparisons; manual cross-role check |
| T3.2 | T3.1 | `app/payroll-master/page.tsx` | AC20 | Manual: payroll master sees placeholder; client is redirected to `/client` |
| T3.3 | plan 2 | `app/dashboard/page.tsx`, `routeDashboard` | AC14 | `tests/access.cjs`: each role → own dashboard; client with `tab=payments` → `/client?tab=payments`; signed out → `/login` |
| T3.4 | T3.3 | `login-form.tsx`, `clerk/complete/page.tsx`, `routeDashboard` | AC15 | `tests/access.cjs`: allowed `returnTo` honored; `//evil`, `/\evil`, other role's area, `/dashboard` → own dashboard; manual sign-in with `?returnTo=/admin` as a client lands on `/client` |
| T3.5 | T3.1 | `app/login/page.tsx`, `requireRole` sign-out | AC17 | `tests/access.cjs` suspended/deactivated → revoke + `/login?status=…`; manual: message announced and keyboard reachable |

## Tests

- Extend `tests/access.cjs` (from plan 2) with `routeDashboard` cases and the layout source check.

## Out of scope

- Payroll features on `/payroll-master` (D8); admin role-assignment screen (D15); migrating `/api/*` and `lib/client-auth.ts` sessions (D11); dropping old identity tables (D17); Clerk webhook (D14); self-selecting privileged roles (D4); page content changes beyond protection and redirects (the existing client-side checks in `hub-workspace.tsx` and `client-dashboard.tsx` stay).
- Deferred to plan 4: Supabase user migration.

## Acceptance

- Spec: AC12, AC14, AC15, AC16, AC17, AC18, AC20, AC21.
- Technical: layouts contain no role logic beyond calling `requireRole`; no new dependency.

## Verification

- Routine local checks: `npm run typecheck`, `npm test`, `npm run build`. (`npm run lint` is not runnable.)
- Scoped operations: none beyond those of plans 1-2 (schema applied and session-token claim configured by the user before manual checks).
- Manual (dev server, the six Clerk `+clerk_test` accounts): after `role:set` gives `payroll+clerk_test@example.com` `payroll_master` and `admin+clerk_test@example.com` `admin`: each of the six accounts lands on its own dashboard from `/dashboard`; each is redirected away from the other three areas; a client opening `/admin` never sees admin content; setting a profile's status to `suspended` signs that user out with the message on the next page load.

## Expert skills to apply

- none matching (no UI-design or Next.js expert skill installed).

## Risks and stop points

- Layouts are kept across client-side navigation within one area, so D16 is enforced on page load, not on every in-area soft navigation; the API (`execute()`, plan 1) still refuses non-active profiles. If the reviewer or user needs per-navigation checks, stop: that is a spec change.
- Between deploying this plan and running plan 4's migration, Supabase-only users (including current admins) cannot reach their areas. Deploy plans 3 and 4 together and run the migration immediately (user decision at ship time).
