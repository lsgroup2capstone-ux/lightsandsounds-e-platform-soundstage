---
artifact: plan
schema: 1
feature: 20261009-role-based-access
revision: 1
status: plan-approved
risk: high-risk
---

# Plan 1: Profiles table, server identity resolution, and role:set

- Feature: `.agents/features/20261009-role-based-access/spec.md`
- Design: `.agents/features/20261009-role-based-access/design.md`
- Implements decisions: D1, D2, D4, D11 (API part), D12, D14, D15, D16 (API part), D17
- Spec revision: 3
- Depends on: none
- Status: plan-approved
- Estimate: about 360 lines of diff; split point: T1.4 (`role:set`) can ship separately if the diff passes 400

## Goal

`soundstage.profiles` exists and is filled from `clerk_identities`; every Clerk `/api/data` request resolves its role from `profiles` through one creation path that never grants a privileged role; the Clerk `publicMetadata.role` mirror is written on creation; non-active profiles are refused by the API; and an operator can change a role with `npm run role:set`.

## Evidence (checked in the repository)

- `database/schema.sql:11-16`: `identities` (Supabase), roles `client|provider|admin`.
- `database/schema.sql:18-24`: `clerk_identities`, roles `client|provider`, RLS enabled.
- `database/schema.sql:50-55`: blanket `REVOKE` for `PUBLIC, anon, authenticated` and schema version rows 1-3; a new table must be created before these lines to be covered (AC3).
- `lib/server/data-service.ts:341-343`: Clerk sign-ins rejected for admin emails in `identities` (kept in this plan; removed by plan 4).
- `lib/server/data-service.ts:344-354`: lazy identity creation from `clerk_identities`, imported account role, `signupRole`.
- `lib/server/data-service.ts:355-359`: Supabase-only admin promotion and the "Administrator access was revoked" check that reads `user.app_metadata.role`; Clerk identities never carry that field (`lib/server/clerk-auth.ts:20-22`), so this check would reject Clerk admins.
- `lib/server/data-service.ts:360-366`: UI account record creation in `soundstage-accounts-v2` and the session role.
- `lib/client-auth.ts:185` and `lib/server/domain/client-auth.ts:5`: `AccountRole = "client" | "provider" | "admin"`.
- `app/api/data/route.ts:18`: `x-signup-role` header passed to `execute()` as `signupRole`.
- `scripts/admin-create.cjs`, `scripts/database-admin.cjs`: script style (`@next/env` load, `databaseConfig()`, `console.error` + `process.exitCode = 1`).
- `scripts/migrate-clerk-to-supabase.cjs:5`: `@clerk/backend` `createClerkClient` already used in scripts.
- `tests/postgres-schema.cjs:6-27`: PGlite schema test pattern with `anon`/`authenticated` roles.
- `tests/postgres-schema.cjs:30-38`: PGlite `sql.begin` adapter and `execute()` loader pattern.
- `package.json` `test` script: explicit list of test files; new files must be appended.
- Baseline this session: `npm run typecheck` passed; `npm test` 41 pass, 0 fail. `npm run lint` is not runnable (`eslint` not installed).

## Phases

### Phase 1: Schema

- In `database/schema.sql`, before the `REVOKE ALL ON ALL TABLES` line, add `soundstage.profiles` with the D12 columns: `clerk_user_id text PRIMARY KEY CHECK (clerk_user_id LIKE 'user_%')`, `email text NOT NULL UNIQUE CHECK (email = lower(email))`, `first_name`, `last_name`, `phone` (`text NOT NULL DEFAULT ''`), `role text NOT NULL CHECK (role IN ('client','provider','payroll_master','admin'))`, `status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deactivated'))`, `created_at`, `updated_at timestamptz NOT NULL DEFAULT now()`. Enable RLS.
- Copy: `INSERT INTO soundstage.profiles (clerk_user_id, email, role, created_at) SELECT clerk_id, email, role, created_at FROM soundstage.clerk_identities ON CONFLICT DO NOTHING;` (AC2; no change to source tables).
- Add `INSERT INTO soundstage.schema_versions(version) VALUES (4) ON CONFLICT DO NOTHING;`.

### Phase 2: Profile module and identity resolution

- New `lib/server/profiles.ts` (`import "server-only"`), per the design contract:
  - Create `lib/server/access-rules.ts` with only `ROLES = ["client","provider","payroll_master","admin"] as const` and `type Role` (plan 2 adds the rest; no Node-only imports).
  - `type Profile = { clerkUserId, email, firstName, lastName, phone, role: Role, status }`.
  - `ensureProfile(tx, identity, signupRole)`: select by `clerk_user_id`; if missing, role = `clerk_identities` row role → non-admin imported account role → `signupRole === "provider"` → `"client"`; insert `on conflict (clerk_user_id) do nothing`; re-select; if still missing (email unique conflict) throw `RequestError(409, "This email is linked to another account. Contact support.")`. On insert, call `mirrorRole`.
  - `mirrorRole(clerkUserId, role)`: `createClerkClient({ secretKey }).users.updateUserMetadata(id, { publicMetadata: { role } })`; failure logs `console.warn("role-mirror-failed", clerkUserId)` and does not fail the request (layouts are authoritative; plan 2 re-syncs on mismatch).
  - `findProfileByClerkId(sql, id)` for plan 2.
- In `lib/server/data-service.ts` `execute()`: for Clerk identities, replace the `clerk_identities` select/insert (`:344-354`) with `ensureProfile`; keep the admin-email rejection (`:341-343`) for plan 4. If `profile.status !== "active"`, throw `RequestError("This account is " + status + ".", 403)`. Restrict the Supabase-only admin lines (`:355-359`) to non-Clerk identities. Supabase identities keep using `identities` unchanged (AC22).
- Widen `AccountRole` in `lib/client-auth.ts:185` and `lib/server/domain/client-auth.ts:5` with `"payroll_master"` (type only; no behavior change). Fix any resulting type errors without changing behavior.

### Phase 3: role:set script

- New `scripts/role-set.cjs`, `package.json` script `"role:set": "node scripts/role-set.cjs"`.
- Exported `setRole(sql, clerk, email, role)`: validate role in the four roles and email shape, else throw usage error before any write. In one `sql.begin`: `select ... for update` by lowercase email; none → throw "No profile for <email>. The user must sign in once first."; update `role`, `updated_at`; call `clerk.users.updateUserMetadata`; a Clerk failure throws, rolling back the update (AC8 "change nothing"). Return `{ oldRole, newRole }`.
- `main()` (only when `require.main === module`): load env, build `postgres` from `databaseConfig()` and Clerk client, print `role-set <email> <old> -> <new>`, exit non-zero on any error with the message only.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T1.1 | none | `database/schema.sql` | AC1, AC2, AC3 | `tests/profiles-schema.cjs` (PGlite): columns and constraints, copy from `clerk_identities`, re-run idempotent, source rows unchanged, `anon`/`authenticated` denied |
| T1.2 | T1.1 | `lib/server/access-rules.ts`, `lib/server/profiles.ts`, `lib/server/data-service.ts` | AC4, AC5, AC22 | `tests/profiles.cjs`: first request creates one client/provider profile and calls the mirror; `signupRole` `admin`/`payroll_master` yields `client`; existing `tests/*.cjs` still pass |
| T1.3 | T1.2 | `lib/server/profiles.ts` | AC6 | `tests/profiles.cjs`: two concurrent `execute()` calls for one new Clerk user leave one row |
| T1.4 | T1.1 | `scripts/role-set.cjs`, `package.json` | AC7, AC8 | `tests/role-set.cjs` (PGlite + fake Clerk): valid change returns old/new and mirrors; unknown email, invalid role, and Clerk failure leave the row unchanged |
| T1.5 | T1.2 | `lib/client-auth.ts`, `lib/server/domain/client-auth.ts` | none (supports AC20) | `npm run typecheck` |

## Tests

- Schema constraints, copy, idempotence, privilege denial → `tests/profiles-schema.cjs`.
- Profile creation, privileged-role refusal, mirror call, concurrency, non-active 403 → `tests/profiles.cjs` (loader overrides for `@clerk/backend` or `@clerk/nextjs/server` and `lib/server/database.ts`).
- role:set success and no-change failures → `tests/role-set.cjs`.
- Append all three to the `test` script in `package.json`.

## Out of scope

- Payroll features on `/payroll-master` (D8); an admin role-assignment screen (D15); migrating `/api/*` and `lib/client-auth.ts` sessions to the new helpers (D11); dropping `clerk_identities`/`identities` (D17); a Clerk `user.created` webhook (D14); self-selecting `payroll_master`/`admin` (D4); page content changes beyond protection and redirects.
- Deferred to plans 2-3: helpers and proxy (plan 2); layouts, `/dashboard`, login redirects, `/payroll-master` page (plan 3).
- Deferred to plan 4: Supabase user migration and the admin-email rejection removal.

## Acceptance

- Spec: AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC22.
- Technical: schema stays additive and repeatable; recovery is reverting the code (the `profiles` table may remain unused). No file over 300 lines added; `data-service.ts` must not grow.

## Verification

- Routine local checks: `npm run typecheck`, `npm test`. (`npm run lint` cannot run: `eslint` is not installed; record that.)
- Scoped operations: applying the schema with `npm run db:init` to Supabase and running `npm run role:set` against it. Target: the project's Supabase database. Not authorized by this plan; the implementer must not run them. The user runs them after review.
- Manual (after the user applies the schema): sign in as `client1+clerk_test@example.com`, confirm one `profiles` row with role `client` and Clerk `publicMetadata.role = "client"`.

## Expert skills to apply

- supabase-postgres-best-practices: table, constraint, index and privilege choices in T1.1; idempotent migration.
- supabase: confirm `soundstage` stays unexposed to the Data API and RLS/privilege tests are meaningful.

## Risks and stop points

- `execute()` behavior for existing Clerk users changes source table → keep `clerk_identities` fallback in `ensureProfile`; if any existing test needs semantic changes beyond the table swap, stop and report.
- `@clerk/backend` is a transitive dependency → if it cannot be required from scripts, stop and ask before adding it to `package.json`.
- Email conflict between a `profiles` row and a new Clerk user → 409 per design; do not auto-merge accounts.
