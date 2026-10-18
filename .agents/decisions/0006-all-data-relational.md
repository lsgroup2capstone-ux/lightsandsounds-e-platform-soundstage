# 0006: The database is the 11 core tables of the data dictionary

- Status: accepted (user, 2026-10-18)
- Date: 2026-10-18
- Feature: .agents/features/20261018-relational-data/spec.md (revision 2)

## Context

Accounts, services, subscriptions, the activity log, messages and other
collections were JSON in `soundstage.records`, beside a growing set of
relational tables. The user asked for a plain relational database ("not jsonb
or anything", "it should be rdbms") that follows the capstone data dictionary:
Tables 3-9 (users, service packages, bookings, schedules, payments, feedback,
subscriptions) plus messages, refunds, notifications and audit log.

## Decision

- The database is exactly 11 tables in schema `soundstage`: `users`,
  `service_packages`, `bookings`, `schedules`, `payments`, `feedback`,
  `subscriptions`, `messages`, `refunds`, `notifications`, `audit_log`.
- Number primary keys (`bigint` identity) and foreign keys for every
  relationship. No `json`/`jsonb` columns.
- No password column: Clerk keeps passwords; `users.clerk_user_id` links them.
- Features without their own table live as columns: provider verification and
  documents on `users`; reschedule/cancellation request, client report and
  provider payout on `bookings`; booking status history and money decisions in
  `audit_log`.
- Payments, refunds, feedback and the audit log are never deleted; feedback and
  audit rows are never changed. The app never deletes users (deactivate).
- The browser wire format stays the same: the server projects the tables into
  the existing record keys.

## Consequences

- Withdrawal requests, platform fees, payout deductions, the legacy Supabase
  phone-OTP signup and the separate status-history tables are gone.
- Existing Supabase data moves once with `database/migrate-to-core-tables.sql`.
