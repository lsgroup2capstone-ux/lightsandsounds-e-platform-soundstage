---
artifact: implementation
schema: 1
feature: 20261018-relational-data
revision: 2
status: ready-for-review
risk: high-risk
---

# Implementation 4: The 11 core tables

- Plan: `plan-4-core-tables.md`
- Part: all
- Date: 2026-10-18
- Spec revision: 2

## Summary

The database is the user's 11 core tables. Sign-in, accounts, provider
verification, packages, bookings, requests, availability, payments,
subscriptions, refunds, feedback, messages, reports and activity all read and
write them. The Supabase migration script copies the current data (5 users,
1 package, 1 trial, activity) and deletes the old tables; it was rehearsed in
PGlite against the old layout and produces exactly the same tables as
`database/schema.sql`.

## Files changed

| File | Change |
| --- | --- |
| `database/schema.sql` | rewritten: 11 tables, keys, guards |
| `database/migrate-to-core-tables.sql` | new: one-time Supabase move (copy + drop old tables) |
| `lib/server/db/users.ts` | new: user id lookups and display names |
| `lib/server/db/record-store.ts` | rewritten for the 11 tables |
| `lib/server/auth/profiles.ts` | profiles from `users`; first Clerk sign-in links by email |
| `lib/server/bookings/core.ts`, `requests.ts`, `availability.ts`, `compat.ts` | new columns; status history in `audit_log`; requests on the booking row; time range parsing |
| `lib/server/payments/checkout.ts`, `webhook.ts`, `ledger.ts` | new payment columns; subscription checkouts create a pending plan |
| `lib/server/data-service.ts` | legacy sign-in on `users`; `activateSubscription` in SQL; withdrawals retired |
| `lib/server/domain/client-auth.ts`, `lib/auth/client-auth.ts`, `components/hubs/admin/provider-applications.tsx` | exactly two provider documents |
| `app/api/auth/signup-sms/route.ts` | returns 410 (legacy phone OTP retired) |
| `scripts/auth/role-set.cjs`, `scripts/auth/auth-inventory.cjs`, `scripts/db/database-check.cjs` | read `users` / table counts |
| `package.json` | removed `auth:profiles`, `bookings:migrate`, `auth:migrate`; test list updated |
| tests | rewritten for the tables; new `tests/helpers/seed.cjs` |

## Deviations from the plan

- File deletion was denied in this session. Obsolete files remain on disk but are no longer referenced: `scripts/auth/migrate-clerk-to-supabase.cjs`, `scripts/auth/migrate-identities-to-profiles.cjs`, `scripts/db/migrate-bookings.cjs`, `scripts/db/clear-client-provider-data.cjs`, `lib/server/auth/signup-sms.ts`, `lib/server/domain/withdrawals.ts`, `tests/auth/auth-migration.cjs`, `tests/auth/migrate-identities.cjs`, `tests/auth/signup-sms.cjs`, `tests/migrate-bookings.cjs`, `tests/data/module-tables.cjs`.
- Added `bookings.end_time` and subscription status `pending` after the user reviewed the first SQL (needed by the booking form's time range and manual plan payments).

## Checks (actually run)

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm test` | pass 145/145 |
| `npm run build` | pass (it rewrote `next-env.d.ts`; restored) |
| `npx eslint …` | not run: the repository has no `eslint.config.*` (pre-existing) |

## Manual checks

- Not done: browser click-through per role; running the migration on Supabase (the user runs it).

## Notes for the reviewer

- PayMongo webhook repeats are made harmless by status checks instead of an event table.
- Users are never deleted by the app (foreign keys and audit history); restore updates and adds rows.
