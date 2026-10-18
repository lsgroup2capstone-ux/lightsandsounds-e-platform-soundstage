---
artifact: plan
schema: 1
feature: 20261018-relational-data
revision: 1
status: superseded
risk: high-risk
---

# Plan 3: Refund actions on refund tables, scripts, vault

> Superseded on 2026-10-18 by spec revision 2 and plan-4-core-tables.md (the 11 core tables). Kept for history.

- Feature: `.agents/features/20261018-relational-data/spec.md`
- Implements decisions: D8; D5 (scripts)
- Spec revision: 1
- Depends on: plans 1-2
- Status: plan-approved (user instruction 2026-10-18)
- Estimate: about 250 lines

## Goal

The existing refund request and review actions use `refunds`/`refund_status_history`
instead of JSON text in booking history, and repository scripts read the tables.

## Evidence (checked in the repository)

- `lib/server/bookings/compat.ts:114-130`: `requestRefund` passes payout details as JSON in the history reason; `reviewRefund` transitions the booking.
- `compat.ts:37-38,55-60`: refund projection parses that JSON.
- Scripts reading records for live data: `scripts/auth/auth-inventory.cjs:9`, `scripts/auth/migrate-identities-to-profiles.cjs:27`, `scripts/db/clear-client-provider-data.cjs:15-58`, `scripts/db/database-check.cjs:9`, `scripts/db/migrate-bookings.cjs:62-66,157` (writes `feedback` jsonb).

## Phases

1. `compat.ts`: `requestRefund` validates, transitions the booking to `refund_pending` (reason `Refund requested`), inserts a `requested` refund (amount = verified paid total in centavos, reason category `provider_cancelled`) and history row. `reviewRefund`: Paid → `approved` + `completed` (reference) with history rows, allocates the amount over paid payments newest first (refund D9), booking → `refunded`; Rejected → `rejected` (remarks), booking → `cancelled`. Projection reads the latest refund row.
2. Scripts: read `accounts`/tables; `migrate-bookings.cjs` writes `booking_feedback`/`booking_inclusions`; clear-data clears collection tables and never touches ADR 0004 tables.
3. Vault: `Database.md`, `Data-Dictionary.md` (if present), `Development-Roadmap.md`, `tasks.md`.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T3.1 | plan 2 | `compat.ts` | AC12 | refund request/Paid/Rejected tests check refunds, history, payments, booking |
| T3.2 | plan 2 | `scripts/**` | AC14 | `tests/auth/migrate-identities.cjs`, `tests/migrate-bookings.cjs` pass against tables |
| T3.3 | T3.1 | `.agents/docs/*` | none | vault reflects tables |

## Out of scope

- Two-step refund screens, partial amounts, attachments (refund-module plans).

## Acceptance

- Spec: AC12, AC14.

## Verification

- Routine: `npm test`, `npm run typecheck`, `npm run build`. No scripts run against real databases.
