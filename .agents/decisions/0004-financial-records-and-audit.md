# 0004: Financial records are never deleted; money decisions are audited

- Status: proposed
- Date: 2026-10-09
- Feature: .agents/features/20261009-payroll-master/spec.md

## Context

Refund and withdrawal decisions were made by admins with a mutable JSON audit log, and financial data could be overwritten by restore or record cleanup.

## Decision

- Only the `payroll_master` role decides refunds, provider payouts, and manual subscription payments; admins have no financial views and see money actions only as audit entries.
- `payments`, `payment_events`, `refunds`, `refund_status_history`, `refund_attachments`, `provider_payouts`, `payout_items`, `payout_deductions`, `payout_status_history`, `payout_settings`, `audit_log`, and `booking_status_history` are never deleted; the database rejects `DELETE` on them.
- Corrections are new records (adjustments or status changes), never edits of settled records.
- Every money decision and every admin decision (provider approval, account status, listing takedown, settings) writes an append-only `audit_log` row in the same transaction.

## Consequences

- Backup restore, clear-data, and cleanup code must exclude these tables.
- New money features must write `audit_log` rows and respect immutability.
