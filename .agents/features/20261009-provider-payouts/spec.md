---
artifact: spec
schema: 1
feature: 20261009-provider-payouts
revision: 1
status: spec-approved
risk: high-risk
---

# Provider payout module

- Feature id: 20261009-provider-payouts
- Revision: 1
- Status: spec-approved
- Risk lane: high-risk
- Approved by: user, 2026-10-09
- Related decisions: .agents/decisions/0004-financial-records-and-audit.md (proposed)
- Depends on: .agents/features/20261009-booking-schedule/spec.md, .agents/features/20261009-paymongo-payments/spec.md, .agents/features/20261009-refund-module/spec.md, .agents/features/20261009-role-based-access/spec.md
- Used by: .agents/features/20261009-payroll-master/spec.md (review UI), .agents/features/20261009-provider-module/spec.md (read-only UI)

## Problem

Provider payouts need one shared module that decides eligibility, calculates gross, platform fee, refunds, deductions, and net per booking, records the payroll master's approval and payment details, prevents paying a booking twice, and keeps a permanent status history. The approved payroll-master spec defined payouts with no fee or deductions and no dedicated history.

Facts found in the code:

- No commission or platform fee exists in `lib/` or `components/`; providers pay subscriptions (`lib/server/domain/marketplace-billing.ts:7-11`).
- Legacy provider withdrawals (`lib/withdrawals.ts`) are not linked to bookings; payroll-master D8 retires them into a legacy list.
- Refunds are allowed only on cancelled bookings (refund-module D4), so a completed booking has no refunds under current rules.
- Admin settings exclude financial values (admin-module D9).
- Before this feature, payroll-master D5-D7 and AC12-AC17 defined `provider_payouts` without fees, deductions, or status history; they are revised with this feature.

## Decisions

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | Module boundary | Separate shared module owning `soundstage.provider_payouts`, `soundstage.payout_items` (one per booking), `soundstage.payout_deductions`, `soundstage.payout_status_history`, and `soundstage.payout_settings`, plus payout domain functions. Payroll-master and provider features provide UI. | Payroll master and providers use the same records. |
| D2 | Risk lane | High-risk. | Money. |
| D3 | Platform fee | Percentage of gross, set by the payroll master in `payout_settings` (0-100, up to 2 decimals), starting at 0%. Each change is audited. Each payout item stores the rate it used; later changes never alter existing items. | Business can set the rate without code; history stays accurate. |
| D4 | Deductions | Payroll master adds deduction lines per payout item: type (withholding tax, penalty, adjustment, other), amount, remarks (required). Allowed only while the payout is `draft`. Net may never go below zero. | Flexible and explained. |
| D5 | "Paid" | Fully paid: verified paid payments (minus refunded amounts) equal the booking's snapshot price. | Avoids paying out money never received on the platform. |
| D6 | Calculation per item | gross = verified paid amount; fee = round(gross × rate / 100) to the centavo, half up; refunds = completed refunds on the booking (0 under current rules); net = gross − fee − refunds − deductions. Payout totals are sums of items. All amounts stored as integer centavos. | Explicit and reproducible. |
| D7 | Eligibility | Booking is `completed`, fully paid, has no open refund, cancellation, or reschedule request, and is not on any payout whose status is not `rejected`. A partial unique index enforces one non-rejected payout item per booking. | Requirement "prevent duplicate payouts". |
| D8 | Stages and recorded data | `draft → approved` (approver, approval time, remarks) `→ paid` (payout date, reference number, remarks); `draft|approved → rejected` (remarks required; bookings become eligible again). Paid and rejected payouts are immutable; corrections use a new adjustment payout linked to the original. | Requirement; immutable financial history. |
| D9 | Who approves | Only `payroll_master`. The same person may create and approve; both are recorded. | Allows a single payroll master; two-person rule is a follow-up. |
| D10 | Status history | `payout_status_history` append-only: from, to, actor id, actor role, remarks, timestamp. Database rejects `UPDATE` and `DELETE`. | Requirement "permanent history". |
| D11 | No deletion | Database rejects `DELETE` on all D1 tables. | ADR 0004. |
| D12 | Provider view | Provider sees own payouts with per-booking breakdown (gross, fee and rate, refunds, deductions with remarks, net), status, payout date, reference, and history. No actions; approver shown only as "Approved", not by identity. | Requirement "view but cannot approve". |
| D13 | Grouping | A payout belongs to one provider and contains one or more of that provider's eligible bookings. | Matches batch payment practice. |

## Out of scope

- Sending money through bank or e-wallet APIs: payouts are made outside the system and recorded.
- Two-person approval rule (D9).
- Refunds on completed bookings (refund-module D4).
- Tax computation rules: withholding tax is entered as a deduction line.
- Legacy withdrawal requests: handled by payroll-master D8/AC18.

## Acceptance criteria

Eligibility and creation

- AC1: THE SYSTEM SHALL list a booking as eligible only when it meets every D7 condition.
- AC2: WHEN a payroll master creates a payout from eligible bookings of one provider, THE SYSTEM SHALL create a `draft` payout with one item per booking, computing gross, fee (with the current rate stored on the item), refunds, and net per D6, and insert history and audit rows in one transaction.
- AC3: IF any selected booking is ineligible at save time, belongs to another provider, or is already on a non-rejected payout, THEN THE SYSTEM SHALL reject the payout, name the booking, and write nothing.
- AC4: IF two payouts including the same booking are created concurrently, THEN THE SYSTEM SHALL commit at most one, enforced by the database.

Deductions and amounts

- AC5: WHEN a payroll master adds a deduction (type, amount > 0, remarks 3-500 characters) to an item of a `draft` payout, THE SYSTEM SHALL recompute the item's net and the payout total and write an audit row.
- AC6: IF a deduction would make an item's net negative, or the payout is not `draft`, THEN THE SYSTEM SHALL reject it.
- AC7: THE SYSTEM SHALL store all amounts as integer centavos and compute fees with half-up rounding per item, so totals equal the sum of items exactly.
- AC8: WHEN the payroll master changes the platform fee rate (0-100, up to 2 decimals), THE SYSTEM SHALL save it, write an audit row with before and after values, and leave existing payout items unchanged.

Stages

- AC9: WHEN a payroll master approves a `draft` payout, THE SYSTEM SHALL record approver, approval time, and remarks and set it to `approved`.
- AC10: WHEN a payroll master marks an `approved` payout paid with a payout date (not in the future) and a reference number (3-100 characters), THE SYSTEM SHALL set it to `paid` and record both with remarks.
- AC11: WHEN a payroll master rejects a `draft` or `approved` payout with remarks, THE SYSTEM SHALL set it to `rejected` and make its bookings eligible again.
- AC12: IF a transition is not allowed by D8, required data is missing, or two decisions race, THEN THE SYSTEM SHALL apply at most one and reject the rest without changes.
- AC13: IF anyone attempts to change a `paid` or `rejected` payout, THEN THE SYSTEM SHALL reject it; WHEN a correction is needed, THE SYSTEM SHALL create an adjustment payout linked to the original, which may be negative only as an explicit adjustment.
- AC14: IF a user without the `payroll_master` role attempts to create, edit, approve, pay, reject, or change the fee rate, THEN THE SYSTEM SHALL reject it.

History and integrity

- AC15: THE SYSTEM SHALL insert exactly one `payout_status_history` row and one `audit_log` row for every payout status change, in the same transaction as the change.
- AC16: THE SYSTEM SHALL reject `DELETE` on all payout tables and `UPDATE` on `payout_status_history` at the database level.

Provider view

- AC17: WHEN a provider opens their payouts, THE SYSTEM SHALL show only their own payouts with the D12 breakdown, status, payout date, reference, and history, and no actions.
- AC18: IF a provider requests another provider's payout, THEN THE SYSTEM SHALL respond "Not found".
- AC19: THE SYSTEM SHALL show the provider "Approved" without the approver's identity.

## Non-functional and operational checks

| Area | Requirement or `not applicable` with reason | Evidence |
| --- | --- | --- |
| Security | Role checks server-side; unique index against duplicates; integer centavo arithmetic; parameterized SQL. | Tests for duplicates, races, rounding, denial, triggers. |
| Privacy | Providers see only their own payouts; approver identity hidden from providers. | Tests for cross-provider access. |
| Accessibility | Breakdown tables have headers; forms labelled; results announced. | Manual keyboard check. |
| Performance | Eligibility query indexed on booking status and provider. | `EXPLAIN` review. |
| Observability | History and audit rows for every change, including fee rate changes. | Tests. |
| Rollback | Additive tables; no existing data modified. | Migration review. |

## Follow-ups

- Two-person approval rule.
- Bank or e-wallet payout API integration.
- Refunds on completed bookings and their effect on payouts.

## Change log

- 2026-10-09: revision 1 approved by the user.
