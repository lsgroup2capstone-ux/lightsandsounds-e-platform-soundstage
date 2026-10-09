---
artifact: spec
schema: 1
feature: 20261009-payroll-master
revision: 4
status: spec-approved
risk: high-risk
---

# Payroll master module

- Feature id: 20261009-payroll-master
- Revision: 4
- Status: spec-approved
- Risk lane: high-risk
- Approved by: user, 2026-10-09
- Related decisions: .agents/decisions/0002-bookings-relational-source.md, .agents/decisions/0003-payments-webhook-only.md, .agents/decisions/0004-financial-records-and-audit.md (all proposed)
- Depends on: .agents/features/20261009-role-based-access/spec.md, .agents/features/20261009-booking-schedule/spec.md, .agents/features/20261009-paymongo-payments/spec.md
- Replaces: the `/payroll-master` placeholder from role-based-access D8/AC20.

## Problem

The platform needs a payroll master who owns money decisions: reviewing verified payments, deciding refunds with reference numbers, releasing provider payouts for reviewed completed bookings, and producing financial reports, with every decision audited and no financial record ever deleted. Today admins decide refunds and withdrawals, payouts are not tied to bookings, and the audit log is a mutable JSON array.

Facts found in the code:

- Admins review refunds through `reviewBookingRefund` (`lib/server/domain/client-bookings.ts:101`) in `components/payment/refunds-panel.tsx`.
- Provider withdrawals (`lib/withdrawals.ts`, key `soundstage-withdrawals-v1`, status `Pending|Paid|Rejected`) are created by providers and marked Paid/Rejected by admins in `components/hubs/hub-workspace.tsx:319`. They are not linked to bookings and record no reference number.
- No commission or platform fee exists in `lib/` or `components/`; providers pay subscriptions (`lib/server/domain/marketplace-billing.ts:7-11`).
- The audit log is a JSON array in `soundstage-marketplace-v1` (`marketplace-billing.ts:13-37`), written by `recordAdminAction` and `recordMarketplaceAction`.
- `lib/server/data-service.ts:385` deletes `soundstage.records` rows whose keys disappear; `restoreBackup` replaces JSON app data (`lib/server/backup.ts:53`). `clearAppData` already refuses (`lib/clear-app-data.ts`).
- There is no `src/` folder.

## Decisions

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | Who decides refunds and payouts | Only `payroll_master`. Booking-schedule, client, and provider specs are revised accordingly; admin hub refund and withdrawal panels become read-only. | Single owner for money decisions; separation of duties. |
| D2 | Risk lane | High-risk. | Money and audit records. |
| D3 | Component location | `components/payroll-master/`. | No `src/` folder. |
| D4 | Pages | `/payroll-master` (overview KPIs), `/payroll-master/payments`, `/payroll-master/refunds`, `/payroll-master/refunds/[id]`, `/payroll-master/payouts`, `/payroll-master/payouts/[id]`, `/payroll-master/reports`, `/payroll-master/history`, `/payroll-master/subscriptions`. | Covers every requested capability; subscriptions page added in rev 2. |
| D14 | Manual subscription payments | The payroll master reviews provider-submitted manual subscription payments (GCash or bank transfer reference) and marks them Paid or Rejected (reason required), using the existing activation logic; each decision writes an audit row. | Added in rev 2: admin module removes all money decisions from admin. |
| D5 | New tables | `soundstage.audit_log` (append-only). Refund tables are owned by the refund module and payout tables by the provider payout module (20261009-provider-payouts). | Revised in rev 4: payouts moved to a shared module. |
| D6 | Payout eligibility and amounts | Defined by the provider payout module: completed, fully paid, no open requests, not already on a non-rejected payout; net = gross − platform fee − refunds − deductions. | Revised in rev 4: platform fee and deductions added. |
| D7 | Payout lifecycle | Defined by the provider payout module: `draft → approved → paid` or `rejected`, with approver, payout date, reference, and remarks recorded; corrections by adjustment payouts. The payroll master also manages the platform fee rate and deductions. | Revised in rev 4. |
| D8 | Provider withdrawal requests | Retired. Payroll master releases payouts per completed booking; providers see payouts read-only. Existing pending withdrawal requests appear in a "Legacy requests" list for the payroll master to settle. | Payouts tied to reviewed bookings reconcile cleanly. |
| D9 | Refund review | The payroll master reviews refunds through the refund module: approve (amount ≤ requested, remarks required if lower), reject (remarks), record provider reference to complete, mark failed and retry. | Revised in rev 3: two-step refund flow from the refund module. |
| D10 | No permanent deletion | Database triggers reject `DELETE` on `payments`, `payment_events`, refund-module tables, provider-payout-module tables, `audit_log`, and `booking_status_history`. Backup restore and clear-data never touch these tables. Records change only by status. | Requirement. |
| D11 | Audit log | Every approval, rejection, refund, and payout action inserts an `audit_log` row (actor id, role, action, target type and id, before, after, reason, timestamp) in the same transaction as the action. Triggers reject `UPDATE` and `DELETE`. The JSON audit stays for other actions. | Requirement; tamper resistance. |
| D12 | Reports | Date range plus provider and status filters; totals for collected payments, refunds (pending, paid), payouts (pending, paid), and net; on screen and CSV. | Requirement. |
| D13 | Boundaries | Read-only access to bookings, payments, and provider payout details. Provider registration, approvals, listings, and packages are refused server-side. Full payout account numbers appear only on detail pages, masked in lists and CSV. | Requirement; limits sensitive data exposure. |

## Out of scope

- Provider registration, approval, and service listings (D13).
- Platform fee calculation rules: provider payout module.
- Sending money through PayMongo or bank APIs: payouts and refunds are made outside the system and recorded with a reference.
- Moving the remaining JSON audit entries into `audit_log`.
- Any admin access to financial records: admin sees money actions only as audit entries (admin module D1).

## Acceptance criteria

Access

- AC1: THE SYSTEM SHALL serve every `/payroll-master` page and payroll server action only to signed-in users whose profile role is `payroll_master`.
- AC2: IF a payroll master calls a provider registration, approval, listing, or package action, THEN THE SYSTEM SHALL reject it server-side.
- AC3: THE SYSTEM SHALL show full payout account numbers only on refund and payout detail pages, and mask them (last 4 characters) in lists and CSV exports.

Payments and history

- AC4: WHEN a payroll master opens `/payroll-master/payments`, THE SYSTEM SHALL list payments with client, booking or subscription, type, amount, status, PayMongo reference, and date, defaulting to verified `paid`.
- AC5: WHEN a payroll master searches or filters by date range, status, type, provider, client, or reference, THE SYSTEM SHALL return only matching records with paging.
- AC6: WHEN a payroll master opens `/payroll-master/history`, THE SYSTEM SHALL show transactions, refunds, payouts, and audit entries filterable by kind and date.

Refunds

- AC7: WHEN a payroll master opens `/payroll-master/refunds`, THE SYSTEM SHALL list refunds with booking, client, requested amount, approved amount, reason, status, and requested date, `requested` first, and `/payroll-master/refunds/[id]` SHALL show details, attachments, and full refund history.
- AC8: WHEN a payroll master approves, rejects, completes, fails, or retries a refund, THE SYSTEM SHALL apply the refund module's rules (refund-module AC7-AC11) and show the result.
- AC9: THE SYSTEM SHALL offer a payroll master only the refund actions allowed for the refund's current status.
- AC10: IF a refund action fails validation or the refund changed status meanwhile, THEN THE SYSTEM SHALL show the reason and change nothing.
- AC11: THE SYSTEM SHALL show refunded amounts and partially refunded payments in payments, history, and reports.

Payouts

- AC12: WHEN a payroll master opens `/payroll-master/payouts`, THE SYSTEM SHALL list eligible bookings grouped by provider and existing payouts with status, and `/payroll-master/payouts/[id]` SHALL show the per-booking breakdown, deductions, and status history.
- AC13: WHEN a payroll master creates, edits deductions on, approves, pays, or rejects a payout, THE SYSTEM SHALL apply the provider payout module's rules (provider-payouts AC2-AC13) and show the result.
- AC14: WHEN a payroll master opens payout settings, THE SYSTEM SHALL show the current platform fee rate and its change history and allow changing it per provider-payouts AC8.
- AC15: THE SYSTEM SHALL offer a payroll master only the payout actions allowed for the payout's current status.
- AC16: THE SYSTEM SHALL include gross, platform fees, deductions, and net payouts in reports and history.
- AC17: IF a payout action fails validation or the payout changed status meanwhile, THEN THE SYSTEM SHALL show the reason and change nothing.
- AC18: WHEN legacy pending withdrawal requests exist, THE SYSTEM SHALL list them under "Legacy requests" and let the payroll master mark each paid (reference) or rejected (reason) with an audit row.

Reports

- AC19: WHEN a payroll master generates a report for a date range with optional provider and status filters, THE SYSTEM SHALL show totals for collected payments, refunds pending and paid, payouts pending and paid, and net, computed from the tables.
- AC20: WHEN a payroll master downloads the report, THE SYSTEM SHALL produce a CSV with the same rows and totals, masked account numbers, and values safe from spreadsheet formula injection.

Integrity

- AC21: THE SYSTEM SHALL reject `DELETE` on the D10 tables at the database level.
- AC22: THE SYSTEM SHALL reject `UPDATE` and `DELETE` on `audit_log` at the database level.
- AC23: WHEN any refund or payout action succeeds, THE SYSTEM SHALL have written exactly one audit row in the same transaction; IF the audit insert fails, THEN the action SHALL roll back.
- AC24: THE SYSTEM SHALL keep backup restore and clear-data operations from modifying the D10 tables.

Migration and other modules

- AC25: WHEN the migration runs, THE SYSTEM SHALL copy pending withdrawal requests into the legacy list, skipping already-migrated items and leaving JSON records unchanged (refund migration is refund-module AC20).
- AC26: THE SYSTEM SHALL remove refund, withdrawal, payment, and subscription-payment views and actions from the admin area.
- AC27: WHEN a payroll master opens `/payroll-master/subscriptions`, THE SYSTEM SHALL list pending manual subscription payments; WHEN they mark one Paid, THE SYSTEM SHALL apply the existing subscription extension once and write an audit row; WHEN they reject one, THE SYSTEM SHALL require a reason and write an audit row.
- AC28: IF a manual subscription payment is no longer pending, THEN THE SYSTEM SHALL reject the decision and change nothing.

## Non-functional and operational checks

| Area | Requirement or `not applicable` with reason | Evidence |
| --- | --- | --- |
| Security | Server-side role checks on every action; parameterized SQL; database triggers for no-delete and append-only audit; CSV formula-injection safe. | Tests for denial, concurrency, trigger rejection; CSV test. |
| Privacy | Account numbers masked outside detail pages; reports contain no full account numbers. | Tests on list and CSV output. |
| Accessibility | Tables have headers and captions, filters are labelled, dialogs keyboard operable, decisions announced. | Manual keyboard check. |
| Performance | Lists paged; indexes on status, created date, provider, booking. | Schema review. |
| Observability | `audit_log` for every money decision; errors logged without account numbers. | Tests; log review. |
| Rollback | Additive tables; JSON refund and withdrawal data untouched; reverting code restores admin actions. | Migration review. |

## Follow-ups

- Two-person approval rule for payouts (provider payout module follow-up).
- Move remaining JSON audit entries into `audit_log`.
- Admin screen for payments in `review` (from the payments feature) could live here; decide later.

## Change log

- 2026-10-09: revision 1 approved by the user.
- 2026-10-09: revision 2; added D14, AC27, AC28; changed D4, AC26, Out of scope; affected plans none (not yet planned); reason: user approved the admin module (20261009-admin-module).
- 2026-10-09: revision 3; changed D5, D9, D10, AC7-AC11, AC21, AC25; affected plans none (not yet planned); reason: user approved the refund module (20261009-refund-module).
- 2026-10-09: revision 4; changed D5, D6, D7, D10, Out of scope, AC12-AC17, Follow-ups; affected plans none (not yet planned); reason: user approved the provider payout module (20261009-provider-payouts).
