---
artifact: plan
schema: 1
feature: 20261009-role-based-access
revision: 1
status: plan-approved
risk: high-risk
---

# Plan 4: Migrate Supabase users to Clerk profiles

- Feature: `.agents/features/20261009-role-based-access/spec.md`
- Design: `.agents/features/20261009-role-based-access/design.md`
- Implements decisions: D3, D13 (rev 3), D17
- Spec revision: 3
- Depends on: plan 1 (profiles, `mirrorRole`); ships with plan 3 (see Risks)
- Status: plan-approved
- Estimate: about 230 lines of diff

## Goal

An idempotent, dry-run-by-default script moves every `soundstage.identities` user (admin, client, provider) to Clerk by reusing or creating a passwordless Clerk user with a verified email and inserting a `profiles` row with the same role. After migration, a Supabase Auth session no longer grants access, and Clerk sign-ins for former Supabase admins are no longer rejected.

## Evidence (checked in the repository)

- `database/schema.sql:11-16`: `identities(auth_id, email, role, created_at)`, FK to `auth.users`.
- `lib/server/data-service.ts:341-343`: Clerk sign-ins rejected when `identities` holds the email as `admin` (removed here, AC10).
- `lib/server/data-service.ts:351-353` (after plan 1: the non-Clerk branch): Supabase identities resolved from `identities`.
- `lib/client-auth.ts:60-61`: `.local` admin addresses are signed in through Supabase because Clerk does not accept them as email identifiers; such rows cannot be created in Clerk.
- `lib/client-auth.ts:63-70`: Supabase password fallback stays (D11); after migration it no longer leads to any protected area.
- `scripts/migrate-clerk-to-supabase.cjs:1,18-25`: dry-run-by-default pattern with `--execute`, `databaseConfig()`, `createClerkClient` from `@clerk/backend`.
- `soundstage.records` key `soundstage-accounts-v2` (`scripts/auth-inventory.cjs:9`): source of first and last names.

## Phases

### Phase 1: Migration script

- New `scripts/migrate-identities-to-profiles.cjs`; `package.json` script `"auth:profiles": "node scripts/migrate-identities-to-profiles.cjs"`.
- Exported `migrateIdentities(sql, clerk, { execute })` returning `{ migrated, skipped, failed }`:
  - Rows: `identities` ordered by email, left-joined to `profiles` by email; rows with a profile are `skipped` (`already-migrated`).
  - For each remaining row: `clerk.users.getUserList({ emailAddress: [email] })`; reuse the single match whose primary email is verified; otherwise, when `execute`, `clerk.users.createUser({ emailAddress: [email], skipPasswordRequirement: true, firstName, lastName, publicMetadata: { role } })` (names from `soundstage-accounts-v2` when present).
  - When `execute`: insert `profiles(clerk_user_id, email, first_name, last_name, role)` `on conflict do nothing`; for a reused Clerk user, set the mirror with `updateUserMetadata`.
  - A Clerk rejection (for example a `.local` address) records `failed` with the reason and continues; the run exits non-zero if anything failed.
  - Dry run prints the planned action per email (`would-create`, `would-reuse`, `already-migrated`) and writes nothing.
- `main()` only when `require.main === module`: prints `profile-migrated <email> <role>` / `skipped` / `failed <email> <reason>` lines and a summary; never prints secrets or tokens.

### Phase 2: Stop Supabase access and the old admin rejection

- `lib/server/data-service.ts` `execute()`: delete the Clerk admin-email rejection (`:341-343`). For non-Clerk identities, if `profiles` has a row with the same email, throw `RequestError("Your account now signs in with the new sign-in. Use Forgot password to set your password.", 403)`.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T4.1 | plan 1 | `scripts/migrate-identities-to-profiles.cjs`, `package.json` | AC9 | `tests/migrate-identities.cjs` (PGlite with `auth.users` + fake Clerk): admin/client/provider rows each get a profile with the same role; existing Clerk user reused and mirrored; new user created with `skipPasswordRequirement`; re-run skips all; dry run writes nothing; Clerk rejection → `failed`, others still migrated |
| T4.2 | T4.1 | `lib/server/data-service.ts` | AC10 | `tests/profiles.cjs` additions: Supabase identity whose email has a profile → 403; Clerk identity for an email that is `admin` in `identities` is no longer rejected and resolves via its profile; plan 3 layouts already deny non-Clerk sessions (manual) |

## Tests

- `tests/migrate-identities.cjs` (append to the `test` script); additions to `tests/profiles.cjs`.

## Out of scope

- Payroll features (D8); admin role-assignment screen (D15); migrating `/api/*` and `lib/client-auth.ts` sessions, including removing the Supabase password fallback (D11); dropping `identities`/`clerk_identities` (D17); Clerk webhook (D14); self-selecting privileged roles (D4); page content changes.
- Sending password-setup emails: users use the existing "Forgot password" flow (D13).

## Acceptance

- Spec: AC9, AC10.
- Technical: script is idempotent and dry-run by default; recovery for a bad run is deleting the printed Clerk user IDs and their `profiles` rows (no source data changes).

## Verification

- Routine local checks: `npm run typecheck`, `npm test`. (`npm run lint` is not runnable.)
- Scoped operations: `npm run auth:profiles` (dry run), then `npm run auth:profiles -- --execute`, against the project's Supabase database and the Clerk instance whose keys are configured. Needs `SUPABASE_DB_URL` (not set locally today). Not authorized by this plan; the implementer must not run either. The user runs them, dry run first, at ship time.
- Manual (after the user's run): a migrated user resets their password through "Forgot password", signs in, and lands on their own dashboard; signing in with the old Supabase password reaches no protected area.

## Expert skills to apply

- supabase-postgres-best-practices: the join and insert in the script; no locks held across Clerk API calls longer than one row.
- supabase: confirm reading `identities` and `auth.users` relations needs only the database owner connection already used by `db:init`.

## Risks and stop points

- `.local` or otherwise undeliverable admin emails cannot exist in Clerk → reported as `failed`; the user decides per person (sign up with a real email, then `role:set`). Do not invent replacement emails.
- Deploy order: plan 3 alone locks Supabase-only users out until this script runs. Recommend shipping plans 3 and 4 together and running the dry run before the deploy; the user decides.
- An email that already belongs to a different Clerk user with an unverified primary email → `failed` with reason; do not merge.
