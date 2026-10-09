---
artifact: spec
schema: 1
feature: 20261009-admin-module
revision: 1
status: spec-approved
risk: high-risk
---

# Admin module

- Feature id: 20261009-admin-module
- Revision: 1
- Status: spec-approved
- Risk lane: high-risk
- Approved by: user, 2026-10-09
- Related decisions: .agents/decisions/0001-clerk-auth-profiles-roles.md, .agents/decisions/0004-financial-records-and-audit.md (both proposed)
- Depends on: .agents/features/20261009-role-based-access/spec.md, .agents/features/20261009-provider-module/spec.md, .agents/features/20261009-payroll-master/spec.md

## Problem

Admins need a dedicated area under `/admin` to vet providers, review listings, control account status, watch platform activity, and manage basic settings, while all money responsibilities belong to the payroll master. Today the admin area is a section of the shared `HubWorkspace`, includes payments, refunds, and reports, manually approves subscription payments, supports only an active/inactive notion of accounts, and has no platform settings.

Facts found in the code:

- `app/admin/[[...slug]]/page.tsx` renders `components/hubs/hub-workspace.tsx`; admin sections are overview, providers, reports, payments, refunds, users, analytics (`hub-workspace.tsx:287-293`), rendered at `hub-workspace.tsx:316-319`.
- Provider approval with a reason exists: `reviewProviderApplication(email, status, reason)` (`lib/server/domain/client-auth.ts:38`); a rejected provider may resubmit (`client-auth.ts:32`). Signup documents are embedded data in the account record (`components/hubs/provider-applications.tsx:9`).
- Admins approve manual subscription payments via `reviewSubscriptionPayment` (`lib/server/domain/marketplace-billing.ts:85-97`), which extends `paidUntil` by 30 days.
- Supporting components: `components/hubs/admin-accounts.tsx`, `system-activity.tsx`, `backup-restore.tsx`, `clear-app-data-button.tsx`.
- Role-based access D12 originally defined a boolean `is_active`; revised to `status` with this feature.
- No platform settings exist in `lib/` or `database/schema.sql`.
- Provider module D7 lets approved, subscribed providers publish without admin approval.
- There is no `src/` folder.

## Decisions

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | Financial views in admin | Removed entirely: no payments, refunds, payouts, or financial reports in `/admin`. Admins see money actions only as audit entries. Payroll-master AC26 and booking-schedule AC26 revised. | User's hard boundary; audit gives oversight. |
| D2 | Manual subscription payment review | Moves to the payroll master (payroll-master spec revised). | Keeps provider payment options; money decisions stay with payroll master. |
| D3 | Risk lane | High-risk. | Account and access control. |
| D4 | Component location | `components/admin/`. | No `src/` folder. |
| D5 | Pages | `/admin` (overview), `/admin/providers`, `/admin/providers/[id]`, `/admin/listings`, `/admin/listings/[id]`, `/admin/users`, `/admin/users/[id]`, `/admin/activity`, `/admin/settings`. They replace the admin section of `HubWorkspace`. | Covers every requested capability. |
| D6 | Provider review | Show profile, business details, legacy embedded signup documents, and R2 documents via signed URLs. Approve or reject, reason required for both. Rejected providers may resubmit. Documents uploaded after approval are labelled "New since approval" (review only). | Requirement; resolves provider-module follow-up on re-review. |
| D7 | Account statuses | `profiles.status` = `active`, `suspended`, `deactivated` (role-based D12 revised). Suspended: sign-in blocked with a "suspended" message; provider packages hidden until reactivated. Deactivated: account closed; sign-in blocked; published packages deactivated. Both need a reason and revoke active Clerk sessions. Admins cannot change their own status or the last active admin's status. Nothing is deleted. | Requirement; immediate effect; no lockout. |
| D8 | Listing review | Post-publication review. Admin can take down a listing with a reason; provider sees "Removed by admin" with the reason; provider may edit and republish, which returns it to the admin review queue. | Approved providers go live quickly; standards still enforceable. |
| D9 | Platform settings | Support email, support phone, site-wide announcement banner, and "provider registrations open/closed", stored in new `soundstage.platform_settings`. No financial settings (downpayment %, payment hold). | Basic settings without crossing into finance. |
| D10 | Activity and audit | One read-only page combining `audit_log`, the JSON activity log, and system activity, filterable by actor, role, action, and date. Admin actions (approve, reject, status change, takedown, settings change) write `audit_log` rows in the same transaction. | Requirement; extends ADR 0004 audit to admin actions. |
| D11 | Role assignment | Not in this module; `role:set` script remains (role-based D15). | Not requested. |
| D12 | Backup/restore and clear-data | Kept unchanged under a settings sub-section; they already exclude financial tables. | Not requested to change. |

## Out of scope

- Refunds, payouts, financial reports, payment or subscription-payment decisions: payroll master (D1, D2).
- Role assignment screen (D11).
- Pre-approval of listings (D8).
- Financial platform settings (D9).
- Deleting users, providers, or listings: status changes only.
- Deleting `HubWorkspace`: follow-up once provider and admin pages replace it.

## Acceptance criteria

Access and boundaries

- AC1: THE SYSTEM SHALL serve every `/admin` page and admin server action only to signed-in users whose profile role is `admin` and status `active`.
- AC2: THE SYSTEM SHALL show no payments, refunds, payouts, subscription payments, or financial reports in `/admin`, and SHALL reject any refund, payout, payment, or financial report action called by an admin.

Providers

- AC3: WHEN an admin opens `/admin/providers`, THE SYSTEM SHALL list provider registrations with pending first, showing name, business, submitted date, and status.
- AC4: WHEN an admin opens `/admin/providers/[id]`, THE SYSTEM SHALL show profile, business details, legacy signup documents, and R2 documents through expiring signed URLs, with documents uploaded after approval labelled "New since approval".
- AC5: WHEN an admin approves or rejects a pending provider with a reason (3-500 characters), THE SYSTEM SHALL update the application status, notify the provider through the existing channel, and write an audit row in one transaction.
- AC6: IF the reason is missing or invalid or the application is no longer pending, THEN THE SYSTEM SHALL reject the decision and change nothing.
- AC7: WHILE provider registrations are closed in settings, THE SYSTEM SHALL refuse new provider signups with a clear message and continue allowing client signups.

Listings

- AC8: WHEN an admin opens `/admin/listings`, THE SYSTEM SHALL list published and republished packages with provider, price, status, and last change, republished-after-takedown first.
- AC9: WHEN an admin takes down a listing with a reason, THE SYSTEM SHALL mark it "Removed by admin", hide it from clients, keep existing bookings unchanged, and write an audit row.
- AC10: WHEN a provider edits and republishes a removed listing, THE SYSTEM SHALL return it to the admin review queue as republished.

Users

- AC11: WHEN an admin opens `/admin/users`, THE SYSTEM SHALL list profiles filterable by role and status, with search by name or email.
- AC12: WHEN an admin suspends, deactivates, or reactivates a user with a reason, THE SYSTEM SHALL update `profiles.status`, revoke the user's active Clerk sessions for suspend and deactivate, and write an audit row.
- AC13: WHEN a provider is suspended, THE SYSTEM SHALL hide their packages from clients until reactivated; WHEN a provider is deactivated, THE SYSTEM SHALL deactivate their published packages.
- AC14: IF an admin targets their own account or the last active admin, THEN THE SYSTEM SHALL reject the status change.
- AC15: WHEN a suspended or deactivated user tries to sign in or open a protected page, THE SYSTEM SHALL sign them out and show "This account is suspended" or "This account is deactivated".
- AC16: THE SYSTEM SHALL never delete a profile, provider record, or listing through admin actions.

Activity and settings

- AC17: WHEN an admin opens `/admin/activity`, THE SYSTEM SHALL show `audit_log`, JSON activity, and system activity entries read-only, filterable by actor, role, action, and date, with paging.
- AC18: WHEN an admin saves settings with valid values (email format, phone format, banner up to 300 characters, registrations toggle), THE SYSTEM SHALL store them in `platform_settings` and write an audit row with before and after values.
- AC19: WHEN the announcement banner is set, THE SYSTEM SHALL show it on public and signed-in pages; WHEN cleared, THE SYSTEM SHALL hide it.
- AC20: IF settings values are invalid, THEN THE SYSTEM SHALL show field-level errors and save nothing.
- AC21: THE SYSTEM SHALL keep backup/restore and clear-data behavior unchanged, available only to admins.

## Non-functional and operational checks

| Area | Requirement or `not applicable` with reason | Evidence |
| --- | --- | --- |
| Security | Server-side role and status checks; financial actions refused for admin; self and last-admin protection; Clerk session revocation; signed document URLs. | Tests for denial cases and lockout protection. |
| Privacy | Provider documents only via expiring signed URLs; no payout account data in admin pages. | Review of rendered fields. |
| Accessibility | Tables labelled, filters labelled, decision dialogs keyboard operable, results announced. | Manual keyboard check. |
| Performance | Lists paged; indexed status and role filters. | Schema review. |
| Observability | `audit_log` row for every admin decision and settings change. | Tests. |
| Rollback | Additive `platform_settings` table and status column; reverting code restores `HubWorkspace` admin section. | Migration review. |

## Follow-ups

- Admin screen for assigning roles.
- Delete `HubWorkspace` once provider and admin pages replace it.

## Change log

- 2026-10-09: revision 1 approved by the user.
