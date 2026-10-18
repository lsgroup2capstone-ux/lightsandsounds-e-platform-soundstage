---
artifact: spec
schema: 1
feature: 20261018-relational-data
revision: 2
status: spec-approved
risk: high-risk
---

# Relational data: the 11 core tables

- Feature id: 20261018-relational-data
- Revision: 2
- Status: spec-approved
- Risk lane: high-risk
- Approved by: user, 2026-10-18 (chat: data dictionary Tables 3-9 "it should be like this"; "7 + those 4"; "recommended, just follow my data tables make it in the 4 also"; authorized deleting the old Supabase tables)
- Related decisions: .agents/decisions/0006-all-data-relational.md (accepted)

## Problem

The database mixed JSON collections (`soundstage.records`) with a growing set
of relational tables that did not match the capstone data dictionary. The user
wants a plain RDBMS that follows the dictionary: users, service packages,
bookings, schedules, payments, feedback, subscriptions, plus messages, refunds,
notifications and audit log.

## Decisions

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | Tables | Exactly 11 tables in `soundstage`: `users`, `service_packages`, `bookings`, `schedules`, `payments`, `feedback`, `subscriptions`, `messages`, `refunds`, `notifications`, `audit_log`. | User's data dictionary + 4 agreed additions. |
| D2 | Keys | `bigint` identity primary keys; every relationship is a foreign key; no `json`/`jsonb`. | RDBMS; dictionary uses numeric ids. |
| D3 | Passwords | No password column; Clerk stores passwords; `users.clerk_user_id` links the account. Users copied from the old tables are linked by email at first sign-in. | Security. |
| D4 | Added columns | The dictionary columns plus the columns the screens need (listed in the data dictionary tables 3-13), including `bookings.end_time` for the "6:00 PM – 11:00 PM" range and subscription status `pending`. | Existing features keep working. |
| D5 | Features without a table | Provider verification and two documents (permit, valid ID) on `users`; one reschedule/cancellation request, one client report and the provider payout as columns on `bookings`; booking status history and money decisions in `audit_log`. | User chose 7 + 4 tables only. |
| D6 | Retired | Withdrawal requests (replaced by booking payouts), platform fee and payout deductions, the legacy Supabase phone-OTP signup, payment event de-duplication table. | Not in the 11 tables. |
| D7 | Integrity | Payments and refunds are never deleted; feedback and audit rows never change or disappear; one review per booking; one open refund per booking; no double booking of a provider; the app never deletes users. | Money and audit records. |
| D8 | Screens | The browser keeps receiving the existing record shapes; the server builds them from the tables. | No screen rewrite. |
| D9 | Existing Supabase data | `database/migrate-to-core-tables.sql` copies the 5 users, packages, subscriptions, blocked dates and activity, then deletes the old tables, in one transaction. The user runs it after the code is ready. | User authorized deleting old tables and will run the SQL. |

## Out of scope

- Payroll payout screens, notification creation per event, admin settings screens (columns/tables exist; screens are later plans).
- Running the migration against Supabase (the user runs it).

## Acceptance criteria

- AC1: THE SYSTEM SHALL create exactly the 11 tables with number primary keys, foreign keys for every relationship, no JSON columns, and no access for `anon`/`authenticated`.
- AC2: WHEN the screens save accounts, packages, subscriptions, subscription payments, activity, messages, reports, read state or blocked dates, THE SYSTEM SHALL store them as rows of the 11 tables and read them back in the same shapes.
- AC3: WHEN a client books, THE SYSTEM SHALL store the booking with client, provider and package ids, a price snapshot, start/end times, and record each status change in `audit_log`.
- AC4: THE SYSTEM SHALL reject a second confirmed booking of a provider on overlapping days, a second review per booking, a second open refund per booking, and deleting payments, refunds, feedback or audit rows.
- AC5: WHEN a refund is requested and decided, THE SYSTEM SHALL keep it in `refunds`, update the paid payments' `refunded_amount`, and move the booking to `refunded` or back to `cancelled`.
- AC6: WHEN a PayMongo checkout is paid, THE SYSTEM SHALL mark the payment paid once (repeats change nothing) and confirm the booking or activate the pending subscription.
- AC7: WHEN the migration runs on the old Supabase layout, THE SYSTEM SHALL copy the existing data, delete the old tables, produce the same tables as `database/schema.sql`, and refuse a second run without changes.

## Non-functional and operational checks

| Area | Requirement | Evidence |
| --- | --- | --- |
| Security | Server-only tables; parameterized SQL; no passwords stored. | Schema tests. |
| Privacy | Payout accounts only in `refunds`; screens unchanged. | Review. |
| Accessibility | not applicable: no UI change except the document upload hint. | - |
| Performance | One query per table per request; indexes on foreign keys used in lists. | Review. |
| Rollback | Before the migration: nothing changed. After: restore Supabase backup; old code needs the old tables. | Deployment note. |

## Change log

- 2026-10-18: revision 1 (all collections as tables beside the existing ones) approved in chat.
- 2026-10-18: revision 2 replaces revision 1: the database is the user's 11 core tables. Plans 1-3 superseded by plan 4.
