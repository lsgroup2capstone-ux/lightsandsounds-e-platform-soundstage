---
artifact: implementation
schema: 1
feature: 20261009-role-based-access
revision: 1
status: ready-for-review
risk: high-risk
---

# Implementation 3: Section layouts, dashboard router, and sign-in redirects

- Plan: `plan-3-layouts-and-redirects.md`
- Part: all
- Date: 2026-10-13
- Spec revision: 3

## Summary

All four role areas now have dynamic server layouts that call `requireRole` before rendering children, with stale-claim refresh and retryable fail-closed states. `/dashboard` routes authenticated users from their database profile, `/payroll-master` has its protected placeholder, sign-in completion flows through the server router, and suspended or deactivated profiles are revoked and announced on the login page.

## Files changed

| File | Change |
| --- | --- |
| `app/client/layout.tsx` | Protects the client tree through `requireRole("client")`. |
| `app/provider/layout.tsx` | Protects the provider tree through `requireRole("provider")`. |
| `app/payroll-master/layout.tsx` | Protects the payroll-master tree through `requireRole("payroll_master")`. |
| `app/admin/layout.tsx` | Protects the admin tree through `requireRole("admin")`. |
| `app/payroll-master/page.tsx` | Added the protected payroll tools placeholder. |
| `components/auth/access-refresh.tsx` | Refreshes a stale Clerk session token without rendering area content, then replaces the location. |
| `app/dashboard/page.tsx` | Replaced client content with the database-backed role router and inactive-session handling. |
| `components/auth/login-form.tsx` | Sends email and Google completion through `/dashboard`, preserving `returnTo` for server validation. |
| `app/auth/clerk/complete/page.tsx` | Reads query `returnTo` first, retains the unapproved-provider branch, and otherwise routes through `/dashboard`. |
| `app/login/page.tsx` | Added exact suspended and deactivated alert messages. |
| `tests/access.cjs` | Added all-role dashboard routing, safe/cross-role return targets, layout delegation, and redirect-source checks. |

## Deviations from the plan

- None in user-visible behavior. `routeDashboard` returns the destination while `app/dashboard/page.tsx` calls the shared `revokeInactiveSession` helper before redirecting an inactive profile; this keeps the routing function deterministic for tests while using the same revocation path as the layouts.
- Plans 2 and 3 were implemented sequentially in this session because the user explicitly requested both. Each has its own implementation report and remains subject to independent review.

## Checks (actually run)

| Command | Result |
| --- | --- |
| `node --test tests/access-rules.cjs tests/access.cjs tests/proxy.cjs` | pass: 21 tests, 0 failures |
| `npm.cmd run typecheck` | pass: exit 0 |
| `npm.cmd test` | pass: 85 tests, 0 failures |
| `npm.cmd run build` | pass: compiled successfully; `/client`, `/provider`, `/payroll-master`, `/admin`, and `/dashboard` are dynamic routes |
| `powershell -ExecutionPolicy Bypass -File scripts/validate-artifacts.ps1` | tooling failure before validation: unchanged `$errors`/`$Error` PowerShell collision |
| Lint | not run; the approved plan records lint as unavailable |

Pre-existing failures confirmed before implementation: the same 211 SDD doctor failures and one warning recorded in implementation 2. Existing plan-1 and R2 changes were preserved.

## Manual checks

- Done: none; the all-role and cross-role behavior is covered with deterministic helper, layout-source, and proxy tests.
- Not done: signing in through a browser with all six Clerk test accounts, keyboard checks, and changing a hosted profile to suspended. The latter would mutate the non-local database and was not requested in this turn.

## Notes for the reviewer

- Each layout contains no role comparison; it renders children only for `allow`, renders `AccessRefresh` for `refresh`, and otherwise renders a retryable alert.
- Valid public relative return targets remain allowed by AC15; protected return targets must belong to the profile's database role. `/dashboard`, cross-role paths, protocol-relative URLs, backslashes, and control-character payloads fall back to the role dashboard.
- Do not deploy plan 3 by itself. Per the approved plan, deploy it with plan 4 and run the Supabase-user migration immediately so Supabase-only users are not locked out.
- Plans 1 and 2 have not yet received independent reviews; review dependencies first or review plans 1-3 together.

## Outcome metrics

- Lead time: not measured
- Spec changes after implementation began: 0
- Review rounds: 0
- Automated acceptance coverage: AC12, AC14-AC18, AC20, and AC21 covered by executed tests/source assertions; build verifies the protected route trees
- Escaped defects: unknown
