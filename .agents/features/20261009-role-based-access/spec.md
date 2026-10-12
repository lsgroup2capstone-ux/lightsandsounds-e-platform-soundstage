---
artifact: spec
schema: 1
feature: 20261009-role-based-access
revision: 3
status: spec-approved
risk: high-risk
---

# Shared authentication and role-based access

- Feature id: 20261009-role-based-access
- Revision: 3
- Status: spec-approved
- Risk lane: high-risk
- Approved by: user, 2026-10-09
- Related decisions: .agents/decisions/0001-clerk-auth-profiles-roles.md (proposed)

## Problem

The platform needs four roles (client, provider, payroll_master, admin), each confined to its own area, with Clerk handling authentication and a `profiles` table holding application user details. Today identity is split across two tables and two auth providers, `payroll_master` does not exist, and route protection happens only in the browser after the page loads.

Facts found in the code:

- `database/schema.sql:11-16` defines `soundstage.identities` (Supabase Auth users, roles `client|provider|admin`); `database/schema.sql:18-23` defines `soundstage.clerk_identities` (Clerk users, roles `client|provider` only). No `profiles` table exists.
- `lib/server/data-service.ts:340-361` resolves the identity per request, creates missing identity rows lazily, and rejects Clerk sign-ins for emails that are admins in `identities` (`data-service.ts:342-343`).
- `lib/server/clerk-auth.ts` verifies Clerk session tokens for API requests (`authenticateClerk`).
- `proxy.ts` runs `clerkMiddleware()` without protecting any route and bypasses Clerk entirely when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` or `CLERK_SECRET_KEY` is missing. Its matcher excludes `/api/`.
- Role checks for pages are client-side only: `components/hubs/hub-workspace.tsx:349` (admin/provider) and `components/dashboard/client-dashboard.tsx:140,147`.
- `app/client/page.tsx` and `app/dashboard/page.tsx` both render `ClientDashboard`. `app/provider/[[...slug]]` and `app/admin/[[...slug]]` render `HubWorkspace`. No `app/payroll-master` exists.
- `lib/client-auth.ts` keeps a storage-backed account session used by existing UI; `/api/*` routes authenticate with bearer tokens.
- `app/api/auth/admin-login/route.ts` already returns 410; admins currently sign in through Supabase Auth.
- `scripts/migrate-clerk-to-supabase.cjs` previously moved Clerk clients and providers into Supabase Auth, and `lib/client-auth.ts:63-70` still falls back to a Supabase sign-in, so `identities` may hold Supabase-only clients and providers as well as admins.
- `database/schema.sql:2` states the migration never drops existing tables.

## Decisions

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | Risk lane | High-risk. | Auth, schema and access control change. |
| D2 | Where application user details live | New `soundstage.profiles` table is the single source of truth for identity and role. Existing `clerk_identities` rows are copied into it; server identity resolution reads `profiles`. | One table avoids two copies drifting apart. |
| D3 | Admin authentication | Admins move to Clerk like every other role. | The requirement says Clerk handles authentication; a second login system doubles the attack surface. |
| D4 | Who can set a role | Signup may choose only `client` or `provider`. `payroll_master` and `admin` are set only by a server-side script. | Prevents self-registration as a privileged role. |
| D5 | How route checks read the role | `profiles.role` is mirrored into Clerk `publicMetadata.role`. The proxy uses the mirror for a fast check; each protected section's server layout re-checks against `profiles`, and the database check wins. | Fast edge check, authoritative server check; a stale mirror cannot grant access. |
| D6 | Signed-in user opens another role's area | Redirect to their own dashboard; no content of the other area is rendered. | No information leak, no dead end. |
| D7 | Signed-out user opens a protected route | Redirect to `/login?returnTo=<path>`. After sign-in, honor `returnTo` only if `canAccessPath(role, path)`; otherwise go to the role's dashboard. | Prevents open redirects and cross-role landing. |
| D8 | `/payroll-master` content | A protected placeholder dashboard page. | Payroll features are a separate feature. |
| D9 | `/dashboard` | Becomes a role router that redirects each user to their dashboard. | One post-login landing route; client content no longer shown to other roles. |
| D10 | Clerk keys missing | Fail closed: protected routes show a "sign-in unavailable" error; public pages still work. | Today a missing key silently removes protection. |
| D11 | Helper scope | Shared helpers `getCurrentProfile`, `hasRole`, `requireRole`, `canAccessPath`, `dashboardFor`, used by the proxy and the four section layouts. Existing `/api/*` routes and `lib/client-auth.ts` storage sessions are unchanged. | Respects "do not modify unrelated modules". |
| D12 | `profiles` columns | `clerk_user_id` (PK), `email` (unique, lowercase), `first_name`, `last_name`, `phone`, `role` (one of the four), `status` (`active`, `suspended`, `deactivated`), `created_at`, `updated_at`. | Revised in rev 2: admin module needs three account states. |
| D13 | Migrating existing Supabase users | One-off script migrates every `identities` row (admin, client, provider). For each, it reuses the Clerk user with the same verified email or creates one through the Clerk Backend API with a verified email and no password, then inserts a `profiles` row with the existing role. Users set their own password through the existing "Forgot password" flow. After migration, a Supabase Auth session no longer grants access to any protected area. | Revised in rev 3: nobody is locked out; a Clerk invitation creates no user until accepted, so a profile keyed by `clerk_user_id` could not be written at invitation time. No passwords copied. |
| D14 | When a new user's profile is created | On the first authenticated server request, through one creation path, before any role check. | Matches the existing lazy pattern; no new public webhook endpoint or secret. |
| D15 | Assigning `payroll_master`/`admin` | Script `npm run role:set -- <email> <role>` updates `profiles` and the Clerk mirror. | Keeps this feature focused on access control. |
| D16 | Suspended/deactivated profile or changed role | Re-checked against the database on every protected page load. Suspended or deactivated users are signed out and see "This account is suspended" or "This account is deactivated" on `/login`; a changed role redirects to the new dashboard. | Revocation takes effect without waiting for session expiry. |
| D17 | Old identity tables | Keep `clerk_identities` and `identities`, read-only, after copying into `profiles`. | Rollback safety; schema never drops tables. |

## Out of scope

- Payroll features on `/payroll-master`: separate feature (D8).
- An admin screen for assigning roles: script only for now (D15).
- Migrating `/api/*` routes and `lib/client-auth.ts` storage sessions to the new helpers: unrelated modules (D11).
- Dropping `clerk_identities` and `identities`: follow-up after verification (D17).
- A Clerk `user.created` webhook: rejected in favor of lazy creation (D14).
- Self-selection of `payroll_master` or `admin` at signup: rejected (D4).
- Changing provider, admin, or client page content beyond route protection and redirects.

## Acceptance criteria

Data and roles

- AC1: THE SYSTEM SHALL store each application user in `soundstage.profiles` with the D12 columns, `email` unique and lowercase, and `role` constrained to `client`, `provider`, `payroll_master`, or `admin`.
- AC2: WHEN the schema migration runs, THE SYSTEM SHALL copy every `clerk_identities` row into `profiles` without duplicating rows on re-run and without dropping or altering data in `clerk_identities` or `identities`.
- AC3: THE SYSTEM SHALL keep `profiles` inaccessible to the `anon` and `authenticated` database roles, consistent with the rest of the `soundstage` schema.
- AC4: WHEN a signed-in Clerk user without a profile makes their first authenticated server request, THE SYSTEM SHALL create exactly one profile with role `client` or `provider` (per signup choice) and mirror the role to Clerk `publicMetadata.role`.
- AC5: IF a signup or profile-creation request asks for `payroll_master` or `admin`, THEN THE SYSTEM SHALL create the profile as `client` and never grant the requested privileged role.
- AC6: IF two first requests for the same new user arrive concurrently, THEN THE SYSTEM SHALL end with exactly one profile row.
- AC7: WHEN an operator runs `npm run role:set -- <email> <role>` with a valid email and role, THE SYSTEM SHALL update `profiles.role` and the Clerk mirror and print the old and new role.
- AC8: IF `role:set` receives an unknown email or an invalid role, THEN THE SYSTEM SHALL exit non-zero and change nothing.

Admin migration

- AC9: WHEN the migration script runs, THE SYSTEM SHALL, for each `identities` row, reuse or create a passwordless Clerk user with that verified email and create its `profiles` row with the same role, skipping rows whose email already has a profile, and print each migrated email and role.
- AC10: WHEN migration has run, THE SYSTEM SHALL no longer grant access to any protected area through a Supabase Auth session, and SHALL no longer reject Clerk sign-ins for emails that are admins in `identities`.

Route protection

- AC11: IF a signed-out visitor requests any path under `/client`, `/provider`, `/payroll-master`, or `/admin`, THEN THE SYSTEM SHALL redirect to `/login?returnTo=<requested path>` before rendering any protected content.
- AC12: IF a signed-in user requests a protected area that does not belong to their role, THEN THE SYSTEM SHALL redirect them to `dashboardFor(role)` without rendering the other area's content.
- AC13: THE SYSTEM SHALL map roles to dashboards as: `client` → `/client`, `provider` → `/provider`, `payroll_master` → `/payroll-master`, `admin` → `/admin`.
- AC14: WHEN a signed-in user opens `/dashboard`, THE SYSTEM SHALL redirect them to `dashboardFor(role)`; WHEN a signed-out visitor opens it, THE SYSTEM SHALL redirect to `/login`.
- AC15: WHEN sign-in completes with a `returnTo` path, THE SYSTEM SHALL redirect there only if it is a same-origin relative path and `canAccessPath(role, path)` is true; otherwise it SHALL redirect to `dashboardFor(role)`.
- AC16: IF the Clerk `publicMetadata.role` mirror disagrees with `profiles.role`, THEN THE SYSTEM SHALL authorize using `profiles.role` in the section layout.
- AC17: IF the profile status is `suspended` or `deactivated`, THEN THE SYSTEM SHALL sign the user out on the next protected page load and show "This account is suspended" or "This account is deactivated" on `/login`.
- AC18: IF a signed-in user has no resolvable profile and profile creation fails, THEN THE SYSTEM SHALL deny protected routes and show a retryable error, not a dashboard.
- AC19: IF `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` or `CLERK_SECRET_KEY` is missing, THEN THE SYSTEM SHALL return a "sign-in unavailable" response for protected routes and continue serving public pages.
- AC20: WHEN a `payroll_master` user opens `/payroll-master`, THE SYSTEM SHALL render a placeholder dashboard page.

Helpers

- AC21: THE SYSTEM SHALL expose server-only helpers `getCurrentProfile`, `hasRole`, `requireRole`, `canAccessPath`, and `dashboardFor` from one shared module, and the proxy and all four section layouts SHALL use them rather than duplicating role logic.
- AC22: THE SYSTEM SHALL leave `/api/*` route authentication and `lib/client-auth.ts` behavior unchanged, except where identity resolution moves from `clerk_identities` to `profiles`.

## Non-functional and operational checks

| Area | Requirement or `not applicable` with reason | Evidence |
| --- | --- | --- |
| Security | Fail closed on missing config or profile; role only from `profiles` in layouts; no privileged role from client input; `returnTo` restricted to same-origin relative paths; Clerk secret and service keys server-only. | Unit tests for helpers and redirect rules; review of proxy and layouts; secret scan of diff. |
| Privacy | Profiles hold only the D12 fields; no passwords stored. | Schema review. |
| Accessibility | Disabled-account and sign-in-unavailable messages are announced (`role="alert"`) and keyboard reachable. | Manual check. |
| Performance | Proxy does no database query; one indexed `profiles` lookup per protected layout render. | Code review. |
| Observability | Denied access, role changes, and admin migration actions are logged without tokens or secrets. | Script output and server log review. |
| Rollback | Schema change is additive; old tables stay intact; reverting code restores the previous identity path. | Migration review; re-run of `db:check`. |

## Follow-ups

- Admin screen for assigning roles (status changes are handled by 20261009-admin-module).
- Move `/api/*` routes and `lib/client-auth.ts` storage sessions onto the shared helpers.
- Drop `clerk_identities` and `identities` once `profiles` is verified in production.
- Real payroll features for `/payroll-master`.

## Change log

- 2026-10-09: revision 1 approved by the user.
- 2026-10-09: revision 2; changed D12, D16, AC17, Follow-ups; affected plans none (not yet planned); reason: user approved the admin module (20261009-admin-module).
- 2026-10-12: revision 3; changed D13, AC9, AC10, Problem facts; affected plans none (not yet planned); reason: user decided during planning to migrate all Supabase-only users (not only admins) and to create passwordless Clerk users instead of invitations, because invitations create no user ID to key `profiles` on.
