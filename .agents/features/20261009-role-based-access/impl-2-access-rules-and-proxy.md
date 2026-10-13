---
artifact: implementation
schema: 1
feature: 20261009-role-based-access
revision: 1
status: ready-for-review
risk: high-risk
---

# Implementation 2: Access rules, server helpers, and proxy

- Plan: `plan-2-access-rules-and-proxy.md`
- Part: all
- Date: 2026-10-13
- Spec revision: 3

## Summary

The application now has one pure role/path decision module and one server-only access module backed by `soundstage.profiles`. The proxy fails closed when Clerk keys are unavailable, redirects signed-out protected requests through login with their requested path, uses a valid role claim only as a fast redirect, and always leaves the database-backed layout check authoritative.

## Files changed

| File | Change |
| --- | --- |
| `lib/server/access-rules.ts` | Added role/dashboard mapping, protected-area parsing, access matrix, safe `returnTo` validation, and pure access decisions. |
| `lib/server/access.ts` | Added `getCurrentProfile`, `hasRole`, `requireRole`, shared inactive-session revocation, dashboard routing, and rule re-exports. |
| `proxy.ts` | Added missing-key 503 behavior, signed-out redirects, claim-based cross-role redirects, and the trusted `x-pathname` request header. |
| `tests/access-rules.cjs` | Covers mappings, segment boundaries, path access, redirect safety, and every pure decision branch. |
| `tests/access.cjs` | Covers profile lookup and all server-helper decisions with Clerk, database, header, and redirect doubles. |
| `tests/proxy.cjs` | Covers fail-closed behavior, public paths, signed-out redirects, claim redirects, and header replacement. |
| `package.json` | Added the three access test files to the full test command. |

## Deviations from the plan

- `requireRole` handles a stale claim plus a wrong-area request as `refresh` before redirecting. The pure `resolveAccess` order remains exactly as planned. This extra server-helper branch is required to implement the design's redirect-loop prevention: after a database role change, the old claimed area can load its layout, repair the mirror, refresh the token, and move to the database role's dashboard without rendering protected content.
- Plans 2 and 3 were implemented sequentially in this session because the user explicitly requested both. Each has its own implementation report and remains subject to independent review.

## Checks (actually run)

| Command | Result |
| --- | --- |
| `powershell -ExecutionPolicy Bypass -File scripts/sdd-doctor.ps1` | baseline fail: 211 repository-wide failures and 1 warning, none introduced by this plan |
| `node --test tests/access-rules.cjs tests/access.cjs tests/proxy.cjs` | pass: 21 tests, 0 failures |
| `npm.cmd run typecheck` | pass: exit 0 |
| `npm.cmd test` | pass: 85 tests, 0 failures |
| `npm.cmd run build` | pass: compiled, typechecked, generated 19 pages, and listed Proxy middleware |
| `powershell -ExecutionPolicy Bypass -File scripts/validate-artifacts.ps1` | tooling failure before validation: the unchanged script tries to overwrite PowerShell's read-only `$Error` variable through `$errors` |
| Lint | not run; the approved plan records lint as unavailable |

Pre-existing failures confirmed before implementation: incomplete `.agents/rules/project.md` placeholders, acceptance criteria without plans in unrelated features, missing `.claude` skill mirrors, and the sandbox Git baseline warning. The worktree also already contained plan-1 and R2 plan-3 changes; they were preserved.

## Manual checks

- Done: none; behavior is covered by the focused proxy/helper tests and the production build.
- Not done: browser navigation with the six Clerk test accounts and temporarily removing a Clerk key from a running development server. The session-token `role` claim dashboard setting was not changed because plan 2 explicitly leaves that scoped operation to the user.

## Notes for the reviewer

- The proxy makes no database or Clerk Backend API request. It only consumes the current session token, and a missing or invalid role claim falls through to the authoritative section layout.
- `safeReturnTo` rejects literal and percent-decoded double slashes, backslashes, and control characters. `/dashboard` is not an allowed return target.
- `x-pathname` is overwritten for every protected request and is used only to construct local redirect targets, never to grant access.
- Plan 1 has not yet received an independent review; review this plan together with its dependency or review plan 1 first.
- The artifact validator could not run for any feature because of the unchanged PowerShell variable-name collision described above. Both new reports were manually checked against `.agents/templates/implementation.md`.

## Outcome metrics

- Lead time: not measured
- Spec changes after implementation began: 0
- Review rounds: 0
- Automated acceptance coverage: AC11, AC13, and AC19 covered by executed tests
- Escaped defects: unknown

## Fix round 1 (review round 1)

- F1: the proxy now sends a signed-out `/dashboard` request directly to `/login`; the four role areas still preserve their path and query in `returnTo`.
- F2: `mirrorRole` now reports success/failure. Both stale-claim branches return a retryable `error` decision when Clerk mirroring fails instead of rendering `AccessRefresh` and risking a redirect loop.
- F3: session revocation now reports success/failure. A suspended or deactivated account returns a retryable error if Clerk cannot revoke the session and never redirects with a false successful-sign-out status.
- F4: `getCurrentProfile` receives the actual protected area and logs `access-denied <area> profile-lookup-failed` without IDs or secrets.
- `app/dashboard/page.tsx` also checks the shared inactive-session result and renders a retryable alert on revocation failure; plan 3's reviewer should judge this cross-plan consumer change.
- `node --test tests/access-rules.cjs tests/access.cjs tests/proxy.cjs tests/profiles.cjs`: pass, 27/27.
- `npm.cmd run typecheck`: pass, exit 0.
- `npm.cmd test`: pass, 88/88.
- Status: ready for independent review round 2.
