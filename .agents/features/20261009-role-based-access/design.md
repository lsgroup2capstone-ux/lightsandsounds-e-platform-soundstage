# Design: Shared authentication and role-based access

- Feature: `.agents/features/20261009-role-based-access/spec.md`
- Spec revision: 3
- Risk lane: high-risk

## Context and constraints

- Next.js 16.3.0 with `proxy.ts` (`package.json`, `proxy.ts:1-9`); `@clerk/nextjs` 7.9.4, `@clerk/backend` 3.18.1 (transitive, already required by `scripts/migrate-clerk-to-supabase.cjs:5`).
- PostgreSQL through `postgres`; schema is one idempotent file applied by `npm run db:init` (`scripts/database-init.cjs:9-13`) that never drops tables (`database/schema.sql:2`).
- Every `/api/data` call runs `execute()` in one transaction under advisory lock `74832019` (`lib/server/data-service.ts:327-330`). Identity resolution and the JSON `soundstage-accounts-v2` account store both live there (`data-service.ts:333-366`).
- Tests are `node --test` files using `tests/ts-loader.cjs` (module overrides) and PGlite (`tests/postgres-schema.cjs:4-10`).
- No database URL or Supabase secret is configured locally; Clerk development keys are.

## Ownership and data flow

| State | Owner | Notes |
| --- | --- | --- |
| Authentication (who) | Clerk | Session cookie for pages; bearer token for `/api/*` (unchanged). |
| Role and status (what) | `soundstage.profiles` | Single source of truth (D2). |
| Role mirror | Clerk `publicMetadata.role`, exposed as session claim `role` | Written only by server code after a `profiles` write (D5). Never trusted for a grant. |
| UI account record | `soundstage.records` key `soundstage-accounts-v2` | Unchanged; `execute()` keeps creating it from the resolved profile role. |

Profile creation path (D14): first `/api/data` request → `execute()` → `ensureProfile(tx, identity, signupRole)` in `lib/server/profiles.ts`. Layouts never create profiles; a signed-in user without a profile is sent to `/auth/clerk/complete`, which makes that API call (it already does, via `finishSignup` → `refreshStore`), then continues.

Page request flow:

```text
browser ─► proxy.ts ──(keys missing & protected path)──► 503 "Sign-in unavailable"
              │ (signed out & protected)  ──► /login?returnTo=<path>
              │ (claim role present & !canAccessPath(claim, path)) ──► dashboardFor(claim)
              ▼
     section layout (app/<area>/layout.tsx) ─► resolveAccess(area, getCurrentProfile(), claim)
              allow | redirect(dashboardFor(profile.role)) | signout(status) | complete-signup | error
```

The proxy does no database query. The layout decision always uses `profiles.role` (AC16).

## Contracts

- `lib/server/access-rules.ts` (pure, no imports from Node-only modules; safe in the proxy):
  - `ROLES = ["client","provider","payroll_master","admin"] as const`, `type Role`.
  - `dashboardFor(role)` → `/client` | `/provider` | `/payroll-master` | `/admin` (AC13).
  - `areaFor(path)` → owning role for `/client`, `/provider`, `/payroll-master`, `/admin` and their sub-paths (segment match, so `/clientele` is not `/client`); `"router"` for `/dashboard`; `null` for public paths.
  - `canAccessPath(role, path)` → true for public paths, true when `areaFor(path) === role`, false otherwise and for `/dashboard`.
  - `safeReturnTo(value)` → the value only if it starts with a single `/`, has no `\`, no scheme, and no control characters; otherwise `null`.
  - `resolveAccess({ area, profile, claimRole })` → `{ kind: "allow" } | { kind: "redirect", to } | { kind: "refresh", to } | { kind: "signout", status } | { kind: "complete" } | { kind: "error" }`.
- `lib/server/access.ts` (`server-only`): re-exports the rules and adds `getCurrentProfile()`, `hasRole(profile, ...roles)`, `requireRole(area)` (used by layouts; performs the redirect, sign-out, or error render). This is the one shared module of AC21.
- `lib/server/profiles.ts` (`server-only`): `ensureProfile(tx, identity, signupRole)`, `findProfileByClerkId(sql, id)`, `mirrorRole(clerkUserId, role)`.
- Session claim: the Clerk session token is customized to `{"role": "{{user.public_metadata.role}}"}` (Clerk dashboard, scoped operation). If the claim is absent, the proxy skips the role check and the layout still decides.
- Scripts: `npm run role:set -- <email> <role>` (`scripts/role-set.cjs`); `npm run auth:profiles [-- --execute]` (`scripts/migrate-identities-to-profiles.cjs`, dry run by default like `migrate-clerk-to-supabase.cjs:1`). Each exports its core function for tests and runs `main()` only when `require.main === module`.

## Failure, security, and rollback

- Mirror/profile disagreement: the proxy may redirect on a stale claim. To prevent a redirect loop between proxy and layout, the layout on mismatch rewrites the mirror, then renders `AccessRefresh` (client component: force-refreshes the Clerk token, then `location.replace(dashboardFor(profile.role))`). It renders no area content (AC12, AC16).
- Profile missing: layout → `/auth/clerk/complete?returnTo=<path>`. Creation failure there shows the existing retryable error with a link back to `/login` (AC18). Layout database errors render a `role="alert"` retry message, never children.
- Suspended/deactivated: layout revokes the current Clerk session server-side and redirects to `/login?status=suspended|deactivated` (AC17). `execute()` rejects non-active profiles with 403 so the API agrees.
- Concurrency: `ensureProfile` uses `insert … on conflict (clerk_user_id) do nothing` then re-selects; `execute()` already serializes on the advisory lock (AC6). An email conflict with a different Clerk ID raises a 409, not a second row.
- Privilege: `ensureProfile` derives the role only from (legacy `clerk_identities` row) → (non-admin imported account) → (`signupRole === "provider"`) → `client`. `payroll_master`/`admin` from any input become `client` (AC5). Only `role:set` and the migration script write privileged roles.
- Trust boundaries: browser → proxy (claim, untrusted for grants); proxy → layout (`profiles`, trusted); operator → scripts (database owner + Clerk secret). Secrets stay in server modules and scripts; `access-rules.ts` imports none.
- `returnTo`: only `safeReturnTo` values are honored, then only if `canAccessPath(role, path)` (AC15); `/dashboard` is the single post-login router.
- Missing keys: proxy returns 503 for protected paths and `/dashboard`; public paths pass (AC19). Layouts also refuse when keys are missing (defense in depth).
- Rollback: the schema change is additive (new table, version 4). Reverting code restores `clerk_identities`-based resolution; `profiles` can remain. Migration script is idempotent (skips emails that already have a profile) and dry-run by default; Clerk users it created can be deleted by ID from its printed output.

## Non-functional evidence

- Performance: proxy has no database or Clerk API calls (code review); layouts do one primary-key lookup on `profiles` (code review).
- Accessibility: unavailable, suspended, deactivated, refresh, and retry messages use `role="alert"` or `role="status"` and plain links (manual keyboard check).
- Observability: `console.warn` lines `access-denied <area> <reason>`, `role-set <email> <old>-><new>`, `profile-migrated <email> <role>`; never tokens, secrets, or session IDs.

## Alternatives rejected

- Profile creation in layouts: no signup-role context there, so a provider could be created as a client (D14 path stays in `execute()`).
- Clerk `user.created` webhook: rejected by D14.
- Clerk API call in the proxy to read `publicMetadata`: adds latency per navigation; the session claim gives the same value without a call.
- Clerk invitations for migration: no user ID until accepted (spec rev 3, D13).
