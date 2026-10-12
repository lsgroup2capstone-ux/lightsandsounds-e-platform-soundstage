---
artifact: plan
schema: 1
feature: 20261009-role-based-access
revision: 1
status: plan-approved
risk: high-risk
---

# Plan 2: Access rules, server helpers, and proxy

- Feature: `.agents/features/20261009-role-based-access/spec.md`
- Design: `.agents/features/20261009-role-based-access/design.md`
- Implements decisions: D5 (proxy half), D6, D7 (proxy half), D10, D11
- Spec revision: 3
- Depends on: plan 1
- Status: plan-approved
- Estimate: about 300 lines of diff

## Goal

One shared access module gives the role-to-dashboard map, path rules, safe `returnTo` handling, and the layout decision function; `lib/server/access.ts` exposes the five AC21 helpers; `proxy.ts` fails closed when Clerk keys are missing, sends signed-out visitors of protected paths to `/login?returnTo=…`, and uses the `role` session claim for a fast cross-role redirect without any database call.

## Evidence (checked in the repository)

- `proxy.ts:3-6`: `clerkMiddleware()` with no handler; returns `NextResponse.next()` when either Clerk key is missing (D10 violation).
- `proxy.ts:9`: matcher excludes `api/`, `_next/`, and files with an extension; protected pages are already matched.
- `components/auth/login-form.tsx:13`: current `returnTo` check (`startsWith("/") && !startsWith("//")`), which allows `/\evil` — replaced by `safeReturnTo` in plan 3.
- `app/client/page.tsx`, `app/dashboard/page.tsx`, `app/provider/[[...slug]]/page.tsx`, `app/admin/[[...slug]]/page.tsx`: the protected route trees; no `app/payroll-master` yet.
- `lib/server/data-service.ts:327`, `lib/server/database.ts:6`: `getDatabase()` for the profile lookup.
- `tests/ts-loader.cjs:16-20`: loader overrides by module name, `server-only` stubbed.
- `lib/server/access-rules.ts`: created by plan 1 with `ROLES` and `Role`.

## Phases

### Phase 1: Pure rules (`lib/server/access-rules.ts`)

- Add `dashboardFor`, `areaFor`, `canAccessPath`, `safeReturnTo`, `resolveAccess` exactly as in the design contract. `areaFor` matches whole segments (`/client`, `/client/...`, never `/clientele`). `/dashboard` is area `"router"` and not accessible as a `returnTo` target.
- `resolveAccess({ area, profile, profileError, claimRole })` order: error → `error`; no profile → `complete`; status not active → `signout`; `profile.role !== area` → `redirect(dashboardFor(profile.role))`; `claimRole` set and `!== profile.role` → `refresh(dashboardFor(profile.role))` (layout also re-mirrors); else `allow`.

### Phase 2: Server helpers (`lib/server/access.ts`, `server-only`)

- Re-export the rules. Add:
  - `getCurrentProfile()`: `auth()` from `@clerk/nextjs/server` → `{ userId, sessionId, claimRole }`; signed out → `null`; else `findProfileByClerkId` (plan 1). Returns `{ session, profile, error }`; database errors are caught into `error` and logged as `access-denied <area> profile-lookup-failed`.
  - `hasRole(profile, ...roles)`.
  - `requireRole(area)`: missing Clerk keys → returns `{ kind: "unavailable" }`; signed out → `redirect("/login?returnTo=…")`; otherwise runs `resolveAccess` and performs: `redirect`, `complete` (`/auth/clerk/complete?returnTo=<path>`), `signout` (revoke session via `clerkClient().sessions.revokeSession`, then `redirect("/login?status=<status>")`), `refresh` (call `mirrorRole`, return the decision for the layout to render `AccessRefresh`), `error`/`unavailable` (return for the layout to render an alert). Reads the current path from the `x-pathname` request header set by the proxy.
- Log every non-allow decision as `access-denied <area> <kind>` (no IDs or tokens).

### Phase 3: Proxy (`proxy.ts`)

- Keep the matcher. Wrap with `clerkMiddleware(async (auth, request) => …)`.
- Keys missing: for `areaFor(path) !== null` return a 503 HTML response containing `<p role="alert">Sign-in is temporarily unavailable. Please try again later.</p>`; otherwise `NextResponse.next()` (AC19).
- Public path: `NextResponse.next()`.
- Protected path or `/dashboard`: `const { userId, sessionClaims } = await auth()`; no user → redirect to `/login?returnTo=<encoded path + search>` (AC11). Claim `role` in `ROLES` and the path is a role area the claim cannot access → redirect to `dashboardFor(claim)`. Otherwise pass through with header `x-pathname` set.
- No database or Clerk Backend API calls in the proxy.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T2.1 | plan 1 | `lib/server/access-rules.ts` | AC13 | `tests/access-rules.cjs`: each role's dashboard; `areaFor` segment cases; `canAccessPath` matrix; `safeReturnTo` rejects `//x`, `/\x`, `https://x`, `javascript:`, control chars; `resolveAccess` every branch |
| T2.2 | T2.1 | `lib/server/access.ts` | none here (helpers used by layouts in plan 3, which carries AC16-AC18, AC21) | `tests/access.cjs`: `requireRole` with mocked `auth`, `clerkClient`, `next/navigation` `redirect` (throws), and database: signed out, wrong role, suspended (revoke called), missing profile, lookup error, claim mismatch (mirror called) |
| T2.3 | T2.1 | `proxy.ts` | AC11, AC19 | `tests/proxy.cjs` with `@clerk/nextjs/server` override: keys missing → 503 on `/admin` and pass on `/browse`; signed out `/provider/x?a=1` → `/login?returnTo=%2Fprovider%2Fx%3Fa%3D1`; claim `client` on `/admin` → `/client`; no claim → pass |

## Tests

- `tests/access-rules.cjs`, `tests/access.cjs`, `tests/proxy.cjs`; append to the `test` script.

## Out of scope

- Payroll features on `/payroll-master` (D8); admin role-assignment screen (D15); migrating `/api/*` and `lib/client-auth.ts` sessions (D11); dropping old identity tables (D17); Clerk `user.created` webhook (D14); self-selecting privileged roles (D4); page content changes beyond protection and redirects.
- Deferred to plan 3: layouts, `/dashboard` router, `/payroll-master` page, `AccessRefresh`, login and completion redirects, status messages.

## Acceptance

- Spec: AC11, AC13, AC19.
- Technical: `access-rules.ts` imports nothing Node-only or secret; files under 300 lines.

## Verification

- Routine local checks: `npm run typecheck`, `npm test`. (`npm run lint` is not runnable.)
- Scoped operations: Clerk dashboard → Sessions → customize session token with `{"role": "{{user.public_metadata.role}}"}` on the development instance. Not authorized by this plan; the user does it. Without it, the proxy simply skips the claim check.
- Manual: with dev server running and signed out, open `/admin/accounts` → lands on `/login?returnTo=%2Fadmin%2Faccounts`; temporarily unset `CLERK_SECRET_KEY` → `/client` shows the unavailable message and `/` still renders.

## Expert skills to apply

- none matching (no UI-design or Next.js expert skill installed); `supabase` not needed for this plan.

## Risks and stop points

- `auth()` in the Next 16 proxy or `sessionClaims` shape differs from expectations in `@clerk/nextjs` 7.9.4 → check the installed types; if the claim is not readable, stop and report rather than calling the Clerk API in the proxy.
- `x-pathname` header spoofing: the proxy always overwrites it; layouts use it only to build redirect targets, never to grant access.
