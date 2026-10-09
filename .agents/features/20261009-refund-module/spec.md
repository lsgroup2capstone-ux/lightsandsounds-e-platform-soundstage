---
artifact: spec
schema: 1
feature: 20261009-refund-module
revision: 1
status: spec-approved
risk: high-risk
---

# Refund module

- Feature id: 20261009-refund-module
- Revision: 1
- Status: spec-approved
- Risk lane: high-risk
- Approved by: user, 2026-10-09
- Related decisions: .agents/decisions/0002-bookings-relational-source.md, .agents/decisions/0004-financial-records-and-audit.md (both proposed)
- Depends on: .agents/features/20261009-booking-schedule/spec.md, .agents/features/20261009-paymongo-payments/spec.md, .agents/features/20261009-role-based-access/spec.md
- Used by: .agents/features/20261009-client-module/spec.md (request UI), .agents/features/20261009-payroll-master/spec.md (review UI)
- Reuses: R2 upload service from .agents/features/20261009-provider-module/spec.md (D5)

## Problem

Refunds need one shared module that owns refund records, eligibility, amounts, review stages, payment and booking updates, and an immutable history. Today refunds are a field on JSON bookings, always equal the full amount paid, have a single approve/reject step, carry no reason or supporting details, and do not update payment records.

Facts found in the code:

- Refunds today: `requestBookingRefund(id, method, account)` stores `booking.refund = { status: "Pending", amount: booking.downpayment, ... }` and requires a paid booking cancelled by the provider (`lib/server/domain/client-bookings.ts:88-99`).
- Review today: `reviewBookingRefund(id, "Paid" | "Rejected", details)` sets status with a reference or reason in one step (`client-bookings.ts:101-116`). Refund shape: `lib/mock-data.ts:63`.
- Payout methods accepted today: GCash, Maya, Bank transfer (`client-bookings.ts:93`).
- Approved specs before this feature: payroll-master D5/D9 (single-step decision, full amount), client D8/AC19 (method and account only), booking-schedule D8 (`refund_pending → refunded | cancelled`), paymongo-payments D3 (no refunded payment state). All are revised with this feature.

## Decisions

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | Module boundary | Separate shared module owning `soundstage.refunds`, `soundstage.refund_status_history`, and `soundstage.refund_attachments`, plus all refund domain functions. Client and payroll-master features provide the UI. | Clients, payroll master, and bookings all depend on refunds. |
| D2 | Risk lane | High-risk. | Money. |
| D3 | Amount | Client requests an amount ≤ refundable (verified paid total − completed refunds − amounts in open requests), defaulting to the full refundable amount. Payroll master approves the requested amount or less; a lower amount needs remarks. A database check prevents the total refunded exceeding the total paid. | Requirement "cannot exceed the total amount paid". |
| D4 | Eligibility | Paid booking in `cancelled`, cancelled by the provider or by an approved cancellation request. Completed-booking disputes are out of scope. | Keeps the established rule. |
| D5 | Repeat requests | At most one open request (`requested` or `approved` or `failed`) per booking. After rejection or withdrawal, the client may submit a new request with a new reason while a refundable amount remains. | Prevents parallel claims; allows correction. |
| D6 | Request content | Reason category (provider cancelled, event cancelled, service issue, other), supporting details text (10-2,000 characters), up to 3 optional attachments (JPG/PNG/PDF ≤ 5 MB each, private R2), payout method (GCash, Maya, Bank transfer) and payout account (6-200 characters), request date. | Requirement plus existing payout fields. |
| D7 | Stages | `requested → approved` (approved amount, remarks) `→ completed` (provider reference number); `requested → rejected` (remarks required); `approved → failed` (remarks required) `→ approved` (retry); `requested → withdrawn` (client). Any other transition is rejected. | Separates the decision from the money movement. |
| D8 | Money movement | Manual payout outside the system (GCash, Maya, bank) with the provider reference number recorded at `completed`. PayMongo refund API is a follow-up. | Matches approved specs; avoids a new external write. |
| D9 | Updates on completion | In one transaction: allocate the refunded amount across the booking's paid payments newest first, incrementing each payment's `refunded_amount` and setting status `partially_refunded` or `refunded`; move the booking to `refunded`; insert history and audit rows. | Requirement "update the payment and booking". |
| D10 | Booking status mapping | New request → booking `refund_pending`; `approved`/`failed` keep `refund_pending`; `completed` → `refunded`; `rejected` or `withdrawn` → back to `cancelled`. | Aligns with booking-schedule statuses. |
| D11 | History | `refund_status_history` is append-only: from status, to status, actor id, actor role, remarks, amount, timestamp. Clients see their own refund's history; payroll master sees all; admins see only audit entries. | Requirement "keep complete refund history". |
| D12 | No deletion | Database triggers reject `DELETE` on `refunds`, `refund_status_history`, and `refund_attachments`, and `UPDATE` on `refund_status_history`. Attachments are never removed from R2 by application code. | Requirement; ADR 0004. |

## Out of scope

- Refunds for completed bookings or service disputes (D4).
- Automatic refunds through the PayMongo refund API (D8).
- Refund policy percentages or deadlines.
- Request and review page layouts: client and payroll-master features.

## Acceptance criteria

Requesting

- AC1: WHEN the owning client submits a valid request for an eligible booking, THE SYSTEM SHALL create a `requested` refund with amount, reason, details, payout method and account, attachments, and request date, set the booking to `refund_pending`, and insert history and audit rows in one transaction.
- AC2: IF the booking is not the client's, not paid, not `cancelled`, or not cancelled by the provider or an approved cancellation request, THEN THE SYSTEM SHALL reject the request and write nothing.
- AC3: IF the requested amount is zero, negative, not a whole centavo amount, or greater than the refundable amount, THEN THE SYSTEM SHALL reject the request and state the refundable amount.
- AC4: IF an open request already exists for the booking, THEN THE SYSTEM SHALL reject a new request.
- AC5: IF an attachment exceeds 5 MB, has a disallowed type, or a fourth attachment is added, THEN THE SYSTEM SHALL refuse it before upload.
- AC6: WHEN a client withdraws a `requested` refund, THE SYSTEM SHALL set it to `withdrawn`, return the booking to `cancelled`, and insert history and audit rows.

Reviewing

- AC7: WHEN a payroll master approves a `requested` refund with an amount ≤ the requested amount, THE SYSTEM SHALL set it to `approved` with the approved amount and remarks; IF the approved amount is lower than requested and remarks are empty, THEN THE SYSTEM SHALL reject the approval.
- AC8: WHEN a payroll master rejects a `requested` refund with remarks (3-500 characters), THE SYSTEM SHALL set it to `rejected`, return the booking to `cancelled`, and insert history and audit rows in one transaction.
- AC9: WHEN a payroll master records a provider reference number (3-100 characters) on an `approved` refund, THE SYSTEM SHALL set it to `completed` and apply the D9 payment and booking updates in the same transaction.
- AC10: WHEN a payroll master marks an `approved` refund `failed` with remarks, THE SYSTEM SHALL keep the booking `refund_pending`, and WHEN they retry, THE SYSTEM SHALL return it to `approved`.
- AC11: IF a transition is not allowed by D7, or two decisions on the same refund race, THEN THE SYSTEM SHALL apply at most one and reject the rest without changes.
- AC12: IF a non-payroll-master attempts approve, reject, fail, retry, or complete, THEN THE SYSTEM SHALL reject it.

Amounts and payments

- AC13: THE SYSTEM SHALL never let the sum of completed refunds for a booking exceed the sum of its verified paid payments, enforced in the database.
- AC14: WHEN a refund completes, THE SYSTEM SHALL allocate it to paid payments newest first, increment `refunded_amount`, and set each affected payment to `refunded` if fully refunded or `partially_refunded` otherwise.
- AC15: IF the D9 updates fail, THEN THE SYSTEM SHALL roll back the whole completion, leaving the refund `approved`.

History and integrity

- AC16: THE SYSTEM SHALL insert exactly one `refund_status_history` row for every refund status change, in the same transaction.
- AC17: THE SYSTEM SHALL reject `DELETE` on `refunds`, `refund_status_history`, and `refund_attachments`, and `UPDATE` on `refund_status_history`, at the database level.
- AC18: WHEN a client opens their booking's refund, THE SYSTEM SHALL show its current status and full history with remarks and amounts, and no other client's refunds.
- AC19: THE SYSTEM SHALL serve refund attachments only through expiring signed URLs to the owning client and payroll masters.

Migration

- AC20: WHEN the migration runs, THE SYSTEM SHALL copy existing JSON booking refunds into `refunds` (Pending → `requested`, Paid → `completed` with reference, Rejected → `rejected` with reason) with an initial history row, skip already-migrated ones, and leave JSON data unchanged.

## Non-functional and operational checks

| Area | Requirement or `not applicable` with reason | Evidence |
| --- | --- | --- |
| Security | Ownership and role checks server-side; amount caps in database; integer centavo arithmetic; parameterized SQL; signed attachment URLs. | Tests for over-refund, races, denial, triggers. |
| Privacy | Payout account masked outside detail views (payroll-master AC3); attachments private. | Review of list and CSV output. |
| Accessibility | Request form labelled; errors announced; history readable by screen readers. | Manual keyboard check. |
| Performance | Indexed by booking, status, and requested date. | Schema review. |
| Observability | History and audit rows for every change; failures logged without account numbers. | Tests. |
| Rollback | Additive tables and columns; JSON refunds untouched. | Migration review. |

## Follow-ups

- Automatic refunds through the PayMongo refund API.
- Refund policy (percentages, deadlines).
- Refunds for completed-booking disputes.

## Change log

- 2026-10-09: revision 1 approved by the user.
