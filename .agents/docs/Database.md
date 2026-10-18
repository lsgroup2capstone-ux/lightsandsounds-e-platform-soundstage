---
tags:
  - project/database
  - supabase
updated: 2026-10-18
---

# Database

Related notes: [[Architecture]] · [[Modules]] · [[Dependencies]] · [[Decisions]]

> Status: [[Features/20261018-relational-data]] (spec rev 2, plan 4) is implemented and **ready for review**, not shipped. The Supabase project still has the old tables until the user runs `database/migrate-to-core-tables.sql`.

## The 11 core tables (ADR 0006)

`database/schema.sql` creates them in schema `soundstage`. Number primary keys, foreign keys for every relationship, no JSON columns, RLS on and no access for `anon`/`authenticated` (the server connects as the owner).

| # | Table | Holds | Key relationships | Guards |
| --- | --- | --- | --- | --- |
| 3 | `users` | Every account: names, email, phone, role, status, provider business/bio/image, provider verification and two documents | `clerk_user_id` links Clerk | unique email/Clerk id; no password column |
| 4 | `service_packages` | Provider packages | `provider_id → users` | price ≥ 0 |
| 5 | `bookings` | Bookings, price snapshot, time range, one reschedule/cancellation request, one client report, the provider payout | `client_id`, `provider_id → users`; `package_id → service_packages` | status list; no overlapping confirmed bookings per provider |
| 6 | `schedules` | Blocked/opened dates and weekly working days | `provider_id → users` | date xor weekday |
| 7 | `payments` | Booking and subscription payments (PayMongo or manual), refunded amount | `booking_id` or `subscription_id`; `user_id` | never deleted; one open checkout per booking and type |
| 8 | `feedback` | One review per booking | `booking_id` (unique), client, provider | never changed or deleted |
| 9 | `subscriptions` | Trial, pending, active and expired plan periods | `provider_id → users` | plan and status lists |
| 10 | `messages` | Client–provider chat | `booking_id`, `sender_id` | — |
| 11 | `refunds` | Refund requests and payroll decisions | `booking_id`, `client_id`, `decided_by` | never deleted; one open refund per booking |
| 12 | `notifications` | Bell notifications and read receipts | `user_id` | — |
| 13 | `audit_log` | Every status change, money decision and admin action | `user_id` | never changed or deleted |

## How the application uses them

`lib/server/db/record-store.ts` builds the screens' record keys from the tables at the start of each request and writes changed items back. Bookings, requests, availability, payments and refunds use the tables directly (`lib/server/bookings/*`, `lib/server/payments/*`). Booking status history is the `audit_log` rows with `table_name = 'bookings'`.

## Moving the existing Supabase data

`database/migrate-to-core-tables.sql` runs once in the Supabase SQL Editor: it creates the 11 tables, copies users (linked to Clerk at first sign-in by email), packages, subscriptions, blocked dates and activity from `profiles`/`records`, then deletes `records`, `profiles`, `identities`, `clerk_identities`, `signup_phone_verifications`, `schema_versions` and the empty old booking tables. One transaction; a second run stops with "Already migrated".

## Database checks

- `npm run db:init`: applies `database/schema.sql` (user-authorized only).
- `npm run db:check`: row counts of the 11 tables.
- Tests run the schema in PGlite: `tests/data/postgres-schema.cjs`, `tests/data/record-tables.cjs` (includes the migration rehearsal), `tests/auth/profiles-schema.cjs`.

Never copy connection strings, service keys, or values from `.env.local` into this vault.
