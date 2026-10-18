---
artifact: plan
schema: 1
feature: 20261018-relational-data
revision: 2
status: plan-approved
risk: high-risk
---

# Plan 4: The 11 core tables

- Feature: `.agents/features/20261018-relational-data/spec.md`
- Implements decisions: D1-D9
- Spec revision: 2
- Depends on: none (replaces plans 1-3)
- Status: plan-approved (user chose option A "recommended", 2026-10-18)

## Goal

`database/schema.sql` is the 11 core tables; every server module reads and
writes them; `database/migrate-to-core-tables.sql` moves the existing Supabase
data and deletes the old tables when the user runs it.

## Phases

1. Schema: `database/schema.sql` (idempotent create) and `database/migrate-to-core-tables.sql` (old layout → copy → drop), built from the same table definitions.
2. Users and sign-in: `lib/server/db/users.ts`, `lib/server/auth/profiles.ts` (link Clerk id by email), legacy Supabase path in `data-service.ts`, `scripts/auth/role-set.cjs`.
3. Record store: `lib/server/db/record-store.ts` maps the screens' keys to users, service_packages, subscriptions, payments, audit_log, messages, booking reports, notifications (read receipts) and schedules.
4. Bookings: `core.ts`, `requests.ts` (request columns), `availability.ts` (schedules), `compat.ts` (projection, feedback, refunds).
5. Payments: `checkout.ts` (payment row first, payment_id as PayMongo reference), `webhook.ts` (no event table; status checks make repeats harmless), `ledger.ts`, `activateSubscription`.
6. Retire: withdrawal actions (410), legacy phone-OTP route (410); obsolete scripts removed from `package.json`.
7. Tests rewritten for the tables; vault and data dictionary updated.

## Tasks and traceability

| Task | Area | Acceptance | Evidence |
| --- | --- | --- | --- |
| T4.1 | schema | AC1, AC4 | `tests/data/postgres-schema.cjs`, `tests/auth/profiles-schema.cjs` |
| T4.2 | record store | AC2 | `tests/data/record-tables.cjs` (first test), `tests/data/backup.cjs`, `tests/data/supabase-domain.cjs` |
| T4.3 | bookings | AC3, AC4 | `tests/bookings.cjs`, `tests/bookings-requests.cjs`, `tests/data/events.cjs` |
| T4.4 | refunds | AC5 | `tests/data/refund-actions.cjs`, `tests/bookings.cjs` refund test |
| T4.5 | payments | AC6 | `tests/paymongo-webhook.cjs`, `tests/paymongo-checkout.cjs` |
| T4.6 | migration | AC7 | `tests/data/record-tables.cjs` (second test) |

## Verification

- Routine: `npm run typecheck`, `npm test`, `npm run build`.
- Scoped: the user runs `database/migrate-to-core-tables.sql` in the Supabase SQL Editor after reviewing; not run by the agent.
