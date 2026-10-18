---
artifact: plan
schema: 1
feature: 20261018-relational-data
revision: 1
status: superseded
risk: high-risk
---

# Plan 1: Module tables and database guards

> Superseded on 2026-10-18 by spec revision 2 and plan-4-core-tables.md (the 11 core tables). Kept for history.

- Feature: `.agents/features/20261018-relational-data/spec.md`
- Implements decisions: D7 (audit tables), D9, D10
- Spec revision: 1
- Depends on: none
- Status: plan-approved (user instruction 2026-10-18)
- Estimate: about 330 lines of diff

## Goal

`database/schema.sql` creates every table still missing from the approved
module specs, with the money and history rules enforced by the database, and
`tests/data/postgres-schema.cjs` proves each rule in PGlite.

## Evidence (checked in the repository)

- `database/schema.sql:1-6`: one transaction under advisory lock `74832019`; tables are never dropped.
- `database/schema.sql:166-171`: existing `soundstage.history_append_only()` and trigger pattern (`DROP TRIGGER IF EXISTS` then `CREATE TRIGGER`).
- `database/schema.sql:180-212`: `payments` (`numeric(12,2)`, `refunded_amount`, statuses incl. `partially_refunded`, `refunded`) and `payment_events`; neither has a delete guard.
- `database/schema.sql:209-218`: blanket `REVOKE` and `schema_versions` 1-5; new objects go before the `REVOKE`.
- `tests/data/postgres-schema.cjs:16`: asserts version count 5.

## Phases

### Phase 1: Shared guards and audit

- `soundstage.reject_delete()` (row and statement triggers for `DELETE`/`TRUNCATE`) and `soundstage.append_only()` (rejects `UPDATE`/`DELETE`), messages naming the table.
- Delete guards on `payments`, `payment_events`.
- `audit_log` (actor id, actor role, action, target type, target id, reason, created_at) and `audit_log_changes` (audit id, field, before_value, after_value); both append-only.

### Phase 2: Refunds (refund-module D1, D3, D5, D7, D11, D12)

- `refunds` with centavo amounts, reason category, details, payout method/account, remarks, provider reference, legacy id; checks tie required fields to status.
- Partial unique index: one open (`requested|approved|failed`) refund per booking.
- Trigger `refund_guard`: allowed transitions only; identity columns immutable; terminal rows immutable; completed total ≤ verified paid total (`payments` in `paid|partially_refunded|refunded`, amount × 100).
- `refund_status_history` append-only; `refund_attachments` (private key, type, ≤ 5 MB, at most 3 per refund).
- `payments.refunded_amount <= amount` check (added once via `pg_constraint` guard).

### Phase 3: Payouts (provider-payouts D1, D3, D4, D6-D8, D10, D11)

- `payout_settings` single row (fee rate 0-100, 2 decimals, default 0).
- `provider_payouts` (kind regular/adjustment, adjusts id, status, approver, payout date, reference, remarks).
- `payout_items` (gross, rate, fee, refunds, deductions, net in centavos; `voided`), checks for net formula and half-up fee on regular items; partial unique index on booking where regular and not voided.
- Triggers: item insert/update only while payout is `draft` (except voiding), booking must belong to the payout's provider; payout transition guard (D8) with required data per status, payout date not in the future, and voiding items on rejection; deductions only on draft payouts and add to the item's deductions/net.
- `payout_deductions`, `payout_status_history` append-only; delete guards on all payout tables.

### Phase 4: Feedback, notifications, settings

- `booking_feedback` (booking unique, client/provider must match the booking), append-only. Provider index.
- `notifications` (recipient email, type from the notifications event table, title, body, relative link, read_at); only `read_at` may change; no delete. Indexes on recipient/created and unread.
- `notification_deliveries` outbox (channel email, status, attempts 0-5, last error, next attempt).
- `profiles.email_notifications boolean not null default true`.
- `platform_settings` single row (support email/phone, announcement ≤ 300, registrations open).
- RLS on every new table; version 6 marker is added by plan 2 (this plan adds no marker so plan 2 can guard its copy).

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T1.1 | none | `database/schema.sql` | AC8 | schema applied twice; every table exists; `anon`/`authenticated` denied |
| T1.2 | T1.1 | `database/schema.sql` | AC9 | delete on payments/payment_events/refunds/payouts/audit rejected; update on history/audit rejected; truncate rejected |
| T1.3 | T1.1 | `database/schema.sql` | AC10 | over-refund, second open refund, bad transition, fourth attachment rejected |
| T1.4 | T1.1 | `database/schema.sql` | AC11 | duplicate booking item, bad net/fee, negative net, non-draft change, wrong provider, bad payout transition rejected; rejection voids items and frees the booking |
| T1.5 | T1.1 | `tests/data/postgres-schema.cjs` | AC8-AC11 | new `test()` blocks "refund guards", "payout guards", "audit, feedback, notifications, settings" |

## Out of scope

- Domain functions and screens for refunds, payouts, notifications, admin settings (their features).
- Collection tables, the copy, and booking column changes (plan 2); refund action rewire and scripts (plan 3).

## Acceptance

- Spec: AC8, AC9, AC10, AC11.
- Technical: additive and rerunnable; existing tests pass.

## Verification

- Routine: `npm test`, `npm run typecheck`.
- Scoped: `npm run db:init` against a real database is not authorized by this plan.

## Risks and stop points

- PGlite statement-level `TRUNCATE` triggers or `DO` blocks failing → stop and report.
