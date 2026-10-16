---
artifact: plan
schema: 1
feature: 20261009-paymongo-payments
revision: 1
status: plan-approved
risk: high-risk
---

# Plan 1: Payment tables and verified webhook

- Feature: `.agents/features/20261009-paymongo-payments/spec.md`
- Design: `.agents/features/20261009-booking-schedule/design.md` (shared; planned together, U1)
- Implements decisions: D1, D2, D3, D4, D6 (webhook side), D8, D9, D10, D11
- Spec revision: 3
- Depends on: booking-schedule plans 1 and 2 (`confirmFromPayment`, `paidTotal` registry)
- Status: plan-approved
- Estimate: about 350 lines of diff

## Goal

Payments are rows in `soundstage.payments`. Every verified PayMongo event is stored once in `payment_events` and processed in the same transaction. A matching paid event marks the payment `paid` and calls the booking module to confirm. Both webhook URLs work.

## Evidence (checked in the repository)

- `lib/server/paymongo.ts:31-38`: `verifyWebhook(body, header)`: HMAC over `t.body`, 300 s window, `te`/`li` by key mode, `timingSafeEqual`. Keep as is.
- `app/api/paymongo/webhook/route.ts:7-20`: verifies, caps at 1 MB, and handles `checkout_session.payment.paid` by calling `execute(null, …, id)`. It does not store the event id.
- `lib/server/data-service.ts:116-152`: `settlePayment` checks reference, livemode, PHP and exact centavos, and activates subscriptions (lines 140-147). Reuse that activation logic once (AC19).
- `lib/server/data-service.ts:412-416`: webhook settlement path inside `execute`.
- `tests/paymongo.cjs`, `tests/paymongo-fixture.cjs`: existing signature tests and the PayMongo stub.

## Phases

### Phase 1: Schema

- `database/schema.sql`: add `payments` and `payment_events` as in design.md "Contracts" (status CHECK with the seven D3 values, `refunded_amount numeric default 0`). Index `checkout_session_id` (unique), add a partial unique index `(target_id, type) WHERE status='pending'`, and an index on `target_id`. Same version-5 transaction as booking plan 1. If booking plan 1 already shipped, use version 6.

### Phase 2: `lib/server/payments/webhook.ts`

- `handleWebhook(raw, signatureHeader)`:
  1. Size above 1 MB → 413.
  2. `verifyWebhook` false → 401 (AC8).
  3. In one `sql.begin`, take the advisory lock, then `INSERT INTO payment_events … ON CONFLICT DO NOTHING RETURNING`. No row means a duplicate: return 200 (AC10).
  4. Dispatch on type:
     - `checkout_session.payment.paid`: find the payment by `checkout_session_id`. Unknown session → event stored, 200 (AC13).
     - Exact match (amount centavos, PHP, livemode, `reference_number`=payment id) and status `pending` → `paid` (AC12). Mismatch → `review` (AC13).
     - When paid and the target is a booking, call `confirmFromPayment` and set the payment to `review` if `confirmed:false` with `hold_expired`/`dates_taken` (AC15/AC16). For a subscription, apply the activation logic moved out of `settlePayment` (AC19).
     - `payment.failed` → `failed` if pending (AC14).
     - Anything else → only stored (D11).
  5. Any thrown error rolls back and returns 503 (AC11).
- Register `paidTotal(bookingId)` = `sum(amount) WHERE target_id=$1 AND status IN ('paid','partially_refunded')` with the booking module registry.
- `app/api/webhooks/paymongo/route.ts`: a new `POST` that calls `handleWebhook`.
- `app/api/paymongo/webhook/route.ts`: becomes `export { POST } from "@/app/api/webhooks/paymongo/route"` and `runtime` (AC7).
- `execute()`: remove the `webhookSession` path. `settlePayment` is no longer used by the webhook.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T1.1 | booking plan 1 | `database/schema.sql` | none (spec D3) | `tests/postgres-schema.cjs`: tables exist, roles denied, pending-unique index |
| T1.2 | T1.1 | both routes | AC7 | `tests/paymongo-webhook.cjs`: same signed body to both URLs → same result |
| T1.3 | T1.2 | `webhook.ts` | AC8 | missing/forged/old/wrong-mode signature → 401; >1 MB → 413; tables unchanged |
| T1.4 | T1.2 | `webhook.ts` | AC9 | event row and payment change committed together |
| T1.5 | T1.4 | `webhook.ts` | AC10 | same event id twice → second 200, no second history row |
| T1.6 | T1.4 | `webhook.ts` | AC11 | `confirmFromPayment` stub throws → 503, no event row |
| T1.7 | T1.4 | `webhook.ts` | AC12 | exact match → `paid` |
| T1.8 | T1.4 | `webhook.ts` | AC13 | amount off by 1 centavo, wrong mode, unknown session → `review`/stored, booking unchanged |
| T1.9 | T1.4 | `webhook.ts` | AC14 | `payment.failed` → `failed` |
| T1.10 | T1.7 | `webhook.ts` | AC15 | 30% paid → booking `confirmed`, history actor `system` |
| T1.11 | T1.7 | `webhook.ts` | AC16 | hold expired → payment `review`, booking `cancelled` (payment expired) |
| T1.12 | T1.7 | `webhook.ts` | AC19 | subscription paid → `paidUntil` extended once; duplicate event does nothing |
| T1.13 | T1.7 | `webhook.ts` | booking AC18, AC19 | no browser action can reach `confirmFromPayment` (allowlist test); duplicate confirmation → one status change |

## Tests

- New `tests/paymongo-webhook.cjs` added to `npm test`, signing bodies with a test `PAYMONGO_WEBHOOK_SECRET` like `tests/paymongo.cjs`.

## Out of scope

- From the spec:
  - Refund payouts through PayMongo.
  - Admin UI for `review` payments.
  - Subscription pricing.
  - Removing the old webhook URL.
  - New payment methods.
- Deferred: checkout creation and the return page (plan 2); the JSON payment migration (booking plan 5).

## Acceptance

- Spec: AC7–AC16, AC19; booking-schedule AC18, AC19.
- Technical: the signature is verified on the raw body before `JSON.parse`; logs contain no payload or secret.

## Verification

- Routine local checks: `npm test`, `npm run typecheck`.
- Scoped operations: switching the PayMongo dashboard webhook URL is a user action after deployment. It is not part of this plan.
- Manual: a PayMongo test-mode webhook (tunnel) to the local `/api/webhooks/paymongo` returns 200 and creates one `payment_events` row.

## Expert skills to apply

- none

## Risks and stop points

- The PayMongo payload shape differs from the fixture (amount path, `reference_number` location) → stop and record the real test-mode payload (redacted) before changing the matching rules.
