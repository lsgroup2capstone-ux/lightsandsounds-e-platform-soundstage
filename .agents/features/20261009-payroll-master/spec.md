---
artifact: spec
schema: 1
feature: 20261009-payroll-master
revision: 6
status: spec-approved
risk: high-risk
---

# Payroll master module

- Feature id: 20261009-payroll-master
- Revision: 6
- Status: spec-approved
- Risk lane: high-risk
- Approved by: user, 2026-10-14 (rev 6)
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
- Hub routing bug (rev 5): `findSection` (`lib/hub-data.ts:84`) knows only `/provider*` and `/admin*` paths and falls back to `providerSections["/provider"]`, so every `/payroll-master` path gets `kind: "provider"`. `HubSection.kind` is typed `"provider" | "admin"` (`lib/hub-data.ts:59`). The client effect at `components/hubs/hub-workspace.tsx:347` then sends any non-provider on a provider-kind section to `/login`, so a payroll master who passes the server check (`app/payroll-master/layout.tsx:7`, `requireRole("payroll_master")`) is redirected away. `hubNav` (`lib/hub-data.ts:40`) has no payroll entry; sidebar label, logo link, header name, and content switch in `HubWorkspace` assume provider or admin.
- Uncommitted work present on 2026-10-14 (author unconfirmed): `app/payroll-master/page.tsx` deleted, `app/payroll-master/[[...slug]]/page.tsx` added; it renders `HubWorkspace` with `initialPath` built from the slug.

## Decisions

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | Who decides refunds and payouts | Only `payroll_master`. Booking-schedule, client, and provider specs are revised accordingly; admin hub refund and withdrawal panels become read-only. | Single owner for money decisions; separation of duties. |
| D2 | Risk lane | High-risk. | Money and audit records. |
| D3 | Component location | `components/payroll-master/`. | No `src/` folder. |
| D4 | Pages | `/payroll-master` (overview KPIs), `/payroll-master/payments`, `/payroll-master/refunds`, `/payroll-master/refunds/[id]`, `/payroll-master/disputes`, `/payroll-master/payouts`, `/payroll-master/payouts/[id]`, `/payroll-master/reports`, `/payroll-master/history`, `/payroll-master/subscriptions`. | Covers every requested capability; subscriptions page added in rev 2. |
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

| D15 | Hub shell (rev 5) | `HubWorkspace` gets a dedicated `payroll_master` section kind instead of reusing provider routing. Built as plan 1 of this feature in the Standard lane: the server `requireRole` stays the real gate, and no data or money logic changes. | Root cause of payroll masters being redirected to `/login`; gives later plans a place to add pages. |
| D16 | Hub navigation | The payroll sidebar lists every D4 page except the `[id]` detail pages (Overview, Payments, Refunds, Reports & disputes, Payouts, Reports, History, Subscriptions, Log out). Until a later plan builds a page, it shows an empty "coming soon" state. | Later plans fill in pages without changing navigation. |
| D17 | Section fallback | `findSection` falls back by path prefix: unknown `/payroll-master/*` goes to the payroll overview, unknown `/admin/*` to the admin overview, and only `/provider*` (and any other path) to the provider overview. | Payroll paths can never get provider handling again. |
| D18 | Payroll hub chrome | Sidebar label "payroll master hub", logo links to `/payroll-master`, header shows the payroll master's name and initials, and the browser redirect lets only `payroll_master` stay. No backup/restore panel, no admin event notifications, no provider verification lock or banner. | Keeps admin-only and provider-only UI out of the payroll hub. |
| D19 | Entry route | The catch-all `app/payroll-master/[[...slug]]/page.tsx` that renders `HubWorkspace` is the entry point; `app/payroll-master/page.tsx` stays deleted. | Matches the uncommitted work; one route serves every D4 path. Its author confirms it before plan 1 is shipped. |
| D20 | Reports and disputes | Client reports and disputes move from the admin hub (`/admin/reports`) to `/payroll-master/disputes`. Only `payroll_master` sees every report and marks reports resolved; each report shows its booking (service, status, event date, venue, downpayment, paid, refund status). The payroll master can read every booking but not booking messages. | The payroll master decides refunds, so they review the disputes behind them. Added in rev 6. |

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

Hub shell (rev 5)

- AC29: WHEN a `payroll_master` user opens any `/payroll-master` path, THE SYSTEM SHALL render the payroll hub (payroll section kind) and SHALL NOT redirect them to `/login` or to a provider page.
- AC30: WHEN a user whose role is not `payroll_master` reaches the payroll hub in the browser, THE SYSTEM SHALL redirect them to `/login`; the server `requireRole` check (AC1) stays in force.
- AC31: THE SYSTEM SHALL show the payroll sidebar entries from D16, highlight the current page, and show a "coming soon" empty state for any page not yet built.
- AC32: WHEN an unknown path under `/payroll-master` is opened, THE SYSTEM SHALL show the payroll overview; WHEN an unknown path under `/admin` is opened, THE SYSTEM SHALL show the admin overview; provider fallback behavior is unchanged.
- AC33: THE SYSTEM SHALL NOT show the backup/restore panel, admin event notifications, or the provider verification lock or banner in the payroll hub, and the logo SHALL link to `/payroll-master`.
- AC34: THE SYSTEM SHALL keep provider and admin hub behavior unchanged, including the provider lock (`isProviderPathLocked`).
- AC35: THE SYSTEM SHALL NOT show Reports, Payments, or Refunds in the admin sidebar, and `/admin/reports`, `/admin/payments`, `/admin/refunds` SHALL fall back to the admin overview.
- AC36: WHEN a payroll master opens `/payroll-master/disputes`, THE SYSTEM SHALL list every client report with its booking summary; WHEN they mark a pending report resolved, THE SYSTEM SHALL save it; IF any other role tries to resolve a report, THEN THE SYSTEM SHALL reject it.
- AC37: THE SYSTEM SHALL give the payroll master read access to all bookings and reports without exposing booking messages.

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
| Accessibility | Payroll sidebar links are keyboard reachable with the current page marked (rev 5). Tables have headers and captions, filters are labelled, dialogs keyboard operable, decisions announced. | Manual keyboard check. |
| Performance | Lists paged; indexes on status, created date, provider, booking. | Schema review. |
| Observability | `audit_log` for every money decision; errors logged without account numbers. | Tests; log review. |
| Rollback | Hub shell is code-only and reverts cleanly (rev 5). Additive tables; JSON refund and withdrawal data untouched; reverting code restores admin actions. | Migration review. |

## Follow-ups

- Two-person approval rule for payouts (provider payout module follow-up).
- Move remaining JSON audit entries into `audit_log`.
- Admin screen for payments in `review` (from the payments feature) could live here; decide later.

## Change log

- 2026-10-09: revision 1 approved by the user.
- 2026-10-09: revision 2; added D14, AC27, AC28; changed D4, AC26, Out of scope; affected plans none (not yet planned); reason: user approved the admin module (20261009-admin-module).
- 2026-10-09: revision 3; changed D5, D9, D10, AC7-AC11, AC21, AC25; affected plans none (not yet planned); reason: user approved the refund module (20261009-refund-module).
- 2026-10-09: revision 4; changed D5, D6, D7, D10, Out of scope, AC12-AC17, Follow-ups; affected plans none (not yet planned); reason: user approved the provider payout module (20261009-provider-payouts).
- 2026-10-14: revision 5; added Problem facts on hub routing, D15-D19, AC29-AC34, accessibility and rollback rows; affected plans none (not yet planned); reason: user chose a dedicated payroll_master hub section instead of provider routing.
- 2026-10-14: revision 6; added D20, AC35-AC37; changed D4, D16; affected plans none (not yet planned); reason: user moved reports and disputes from the admin hub to the payroll master and asked for payroll booking read access.
