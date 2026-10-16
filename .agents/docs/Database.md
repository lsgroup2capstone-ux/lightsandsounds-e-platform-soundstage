---
tags:
  - project/database
  - supabase
updated: 2026-10-15
---

# Database

Related notes: [[Architecture]] · [[Modules]] · [[Dependencies]] · [[Decisions]]

## Current schema

The current executable schema is `database/schema.sql`. It is an idempotent PostgreSQL script applied by `scripts/database-init.cjs`; there is no `supabase/migrations/` directory in the inspected repository. The script records schema versions 1 through 4 but is maintained as one file rather than four separate migration files.

| Table | Purpose | Key relationships | Current access controls |
| --- | --- | --- | --- |
| `soundstage.schema_versions` | Applied schema version markers | None | RLS enabled; direct privileges revoked |
| `soundstage.identities` | Legacy Supabase Auth identity/role mapping | `auth_id` → `auth.users.id` with restricted delete | RLS enabled; no permissive policies; `anon`/`authenticated` privileges revoked |
| `soundstage.clerk_identities` | Legacy Clerk mapping retained for migration/rollback | Clerk user id stored as text | RLS enabled; no permissive policies; direct privileges revoked |
| `soundstage.profiles` | Authoritative Clerk user profile, role, and account status | Primary key `clerk_user_id`; unique lowercase email | RLS enabled; no permissive policies; direct privileges revoked |
| `soundstage.signup_phone_verifications` | Server-only OTP/rate-limit state for legacy Supabase signup | `auth_id` → `auth.users.id` with cascade delete | RLS enabled; no permissive policies; direct privileges revoked |
| `soundstage.records` | JSONB compatibility store for marketplace collections | Text key plus JSONB value | RLS enabled; no permissive policies; direct privileges revoked |

### RLS and privileges

- The `soundstage` schema revokes all access from `PUBLIC`, `anon`, and `authenticated`.
- Every current `soundstage` table has RLS enabled.
- No `CREATE POLICY` statement exists in the current schema, so browser database roles have no policy-granted row access.
- The Next.js server uses the private PostgreSQL connection and performs application authorization before queries and mutations.
- Default table privileges in the schema are also revoked from `PUBLIC`, `anon`, and `authenticated`.

This is deliberate server-only access, not a collection of per-user RLS policies.

## Profiles

`soundstage.profiles` currently contains:

| Column | Rule |
| --- | --- |
| `clerk_user_id` | Primary key; must look like `user_%` |
| `email` | Unique and lowercase |
| `first_name`, `last_name`, `phone` | Non-null text with empty defaults |
| `role` | `client`, `provider`, `payroll_master`, or `admin` |
| `status` | `active`, `suspended`, or `deactivated` |
| `created_at`, `updated_at` | Timestamps with current-time defaults |

The schema copies existing `clerk_identities` rows into `profiles` with `ON CONFLICT DO NOTHING`. The one-off `scripts/migrate-identities-to-profiles.cjs` covers legacy Supabase users, but its hosted execution remains user-controlled.

## JSON record collections

The following keys are implemented inside `soundstage.records`:

| Key or prefix | Stored domain |
| --- | --- |
| `soundstage-accounts-v2` | Client/provider application account records |
| `soundstage-provider-services-v2:<email>` | Provider service packages |
| `soundstage-client-bookings-v3:<email>` | Client bookings, embedded feedback, and refund state |
| `soundstage-schedule:<email>` | Provider blocked dates |
| `soundstage-marketplace-v1` | Subscriptions, manual payments, and JSON audit data |
| `soundstage-booking-messages-v1` | Booking messages |
| `soundstage-provider-reports-v1` | Client reports/disputes |
| `soundstage-withdrawals-v1` | Legacy provider withdrawal requests |
| `soundstage-event-notifications:<role>:<email>` | Read notification identifiers |
| `soundstage-payment:<id>` | Current PayMongo checkout/session state |
| `soundstage-service-ratings-v1` | Derived public ratings snapshot returned by the API, not authoritative persisted feedback |

The API serializes mutations with a transaction-scoped advisory lock, but JSON collections cannot provide the entity-level constraints planned for bookings and finance.

## Planned relational tables

These tables appear in approved specs or plans but do **not** exist in `database/schema.sql` yet.

| Planned owner | Tables |
| --- | --- |
| [[Features/20261009-booking-schedule]] | `bookings`, `booking_status_history`, `availability_schedules`, `reschedule_requests`, `cancellation_requests` |
| [[Features/20261009-paymongo-payments]] | `payments`, `payment_events` |
| [[Features/20261009-refund-module]] | `refunds`, `refund_status_history`, `refund_attachments` |
| [[Features/20261009-provider-payouts]] | `provider_payouts`, `payout_items`, `payout_deductions`, `payout_status_history`, `payout_settings` |
| [[Features/20261009-payroll-master]] | `audit_log` |
| [[Features/20261009-feedback-module]] | `booking_feedback` |
| [[Features/20261009-notifications]] | `notifications`, `notification_deliveries` |
| [[Features/20261009-admin-module]] | `platform_settings` |

The planned finance and history tables have stronger requirements: append-only histories, delete guards, transactionally coupled audit rows, integer-centavo validation, and verified-webhook-only payment transitions. See [[Decisions]].

## Legacy reference schema

`database/legacy/sql-server.sql` contains a prior 16-table SQL Server design. `database/README.md` explicitly says the application did not use it for current screens. It is historical reference only and must not be documented as the active database.

## Database checks

Repository scripts:

- `npm run db:init` applies `database/schema.sql` to the configured database. This is a scoped external write and requires explicit authorization.
- `npm run db:check` reads schema versions from the configured database.
- `tests/postgres-schema.cjs` and `tests/profiles-schema.cjs` execute the schema against embedded PostgreSQL/PGlite.

Never copy connection strings, service keys, or values from `.env.local` into this vault.
