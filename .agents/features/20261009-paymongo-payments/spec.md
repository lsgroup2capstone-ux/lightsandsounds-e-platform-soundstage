---
artifact: spec
schema: 1
feature: 20261009-paymongo-payments
revision: 3
status: spec-approved
risk: high-risk
---

# PayMongo payment module

- Feature id: 20261009-paymongo-payments
- Revision: 3
- Status: spec-approved
- Risk lane: high-risk
- Approved by: user, 2026-10-09
- Related decisions: .agents/decisions/0002-bookings-relational-source.md (proposed), .agents/decisions/0003-payments-webhook-only.md (proposed)
- Depends on: .agents/features/20261009-booking-schedule/spec.md (booking tables and `awaiting_payment → confirmed` transition). Plan together with it.
- Used by: .agents/features/20261009-client-module/spec.md, .agents/features/20261009-provider-module/spec.md

## Problem

Payments must support downpayment and full payment, be stored as proper records, and become paid only through a verified, deduplicated PayMongo webhook that then confirms the booking. The existing module creates checkouts and verifies signatures correctly, but stores payments as JSON, does not record event IDs, lives at a different webhook URL, supports only a fixed downpayment, and marks payments paid from the return page without a webhook.

Facts found in the code:

- `lib/server/paymongo.ts` (`server-only`): `paymentKey` reads `PAYMONGO_SECRET_KEY` and requires `sk_test_`/`sk_live_`; `createCheckout` builds a checkout session in centavos with `reference_number` and success/cancel URLs from `APP_URL`; `verifyWebhook` checks HMAC-SHA256 over `t.body` with `PAYMONGO_WEBHOOK_SECRET`, a 300-second window, `te`/`li` by key mode, and `timingSafeEqual`.
- `tests/paymongo.cjs` covers signature, mode, timestamp, centavos, and secret non-exposure.
- `lib/server/data-service.ts:87-98`: payment records are JSON under `soundstage-paymongo:<id>` (`PaymentRecord` with `kind: "booking" | "subscription"`); `startPayment` rejects a second unfinished checkout and pins checkout URL host to `checkout.paymongo.com`.
- `lib/server/data-service.ts:99-125`: `settlePayment` fetches the checkout session from the PayMongo API, checks reference, mode, currency, and amount, and marks the booking paid.
- `app/payment/return/page.tsx:19` calls `verifyPayment`, which settles payment without a webhook.
- `app/api/paymongo/webhook/route.ts`: verifies signature, caps body at 1 MB, handles only `checkout_session.payment.paid`, does not store event IDs.
- Booking payment is a fixed 30% downpayment (`components/booking/booking-flow.tsx:66`).
- Subscriptions use the same payment path (`components/payment/subscription-panel.tsx`, `lib/server/domain/marketplace-billing.ts`).

## Decisions

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | New or extend | Extend: keep `createCheckout` and `verifyWebhook`; move payment storage to tables and change the settlement flow. | Signature and checkout code is correct and tested. |
| D2 | Risk lane | High-risk. | Money, public webhook, schema. |
| D3 | Tables | `soundstage.payments` (target booking or subscription, type, amount, `refunded_amount` default 0, currency, status `pending|paid|failed|expired|review|partially_refunded|refunded`, checkout session id, checkout URL, timestamps) and `soundstage.payment_events` (PayMongo event id primary key, type, payment id, received_at). Refund statuses and `refunded_amount` are set only by the refund module. | Revised in rev 3: refund module updates payments. |
| D4 | Webhook URL | `/api/webhooks/paymongo` is primary. `/api/paymongo/webhook` delegates to the same handler until the PayMongo dashboard is switched; removal is a follow-up. | Avoids dropping live notifications. |
| D5 | Return page | Shows status read from `payments` only ("Payment processing…" until the webhook arrives); never marks paid. Local development needs PayMongo test webhooks reaching the machine. | User rule: paid only after webhook verification. |
| D6 | Subscriptions | Use the same tables and webhook-only rule; subscription activation logic stays as is. | One payment flow. |
| D7 | Payment types | `downpayment` (30% of booking snapshot price), `full` (snapshot price), `balance` (remaining). Amount always computed server-side. | Requirement; client cannot set amounts. |
| D8 | Amount verification | Webhook payment must match the record exactly: amount in centavos, currency PHP, livemode, and reference. Mismatch → event stored, payment `review`, booking unchanged. | Prevents under-payment or cross-mode confirmation. |
| D9 | Duplicates and failures | Event id inserted in the same transaction as processing; failure rolls back and returns 5xx so PayMongo retries; duplicate id returns 200 without processing. | Exactly-once effect with safe retries. |
| D10 | Booking confirmation | In the same transaction, when verified paid total ≥ 30% of snapshot price, apply the booking module's `awaiting_payment → confirmed` transition. Late payment (hold expired or dates taken) → payment `review`, booking not confirmed. | Booking-schedule D6 and AC17. |
| D11 | Handled events | `checkout_session.payment.paid` → paid; `payment.failed` → failed; other verified events recorded and ignored. | Covers outcomes needed. |
| D12 | Repeat checkout | One open checkout per target and type; if one is open, return its URL instead of an error. | Avoids duplicate charges and dead ends. |

## Out of scope

- Refund payouts through PayMongo: refunds are decided by the payroll master (20261009-payroll-master) and paid outside the system.
- Admin UI for `review` payments: follow-up (also listed in booking-schedule).
- Subscription pricing or plan changes.
- Removing the old webhook URL: follow-up after dashboard switch (D4).
- New payment methods beyond today's GCash, Maya, QR Ph, and card.

## Acceptance criteria

Secrets and checkout

- AC1: THE SYSTEM SHALL read `PAYMONGO_SECRET_KEY` and `PAYMONGO_WEBHOOK_SECRET` only from environment variables in server-only modules, and no client bundle or API response SHALL contain either value.
- AC2: IF either variable is missing or malformed, THEN THE SYSTEM SHALL refuse to create checkouts or accept webhooks with a non-secret error message.
- AC3: WHEN an authenticated owner requests payment for a booking in `awaiting_payment` (or `confirmed` with a balance) or for their subscription, THE SYSTEM SHALL create the checkout session from a server route with the server-computed amount for the chosen type and insert a `pending` payment.
- AC4: IF the requester does not own the target, the booking is in another status, the type is not allowed (for example `downpayment` after a downpayment is paid), or a client-supplied amount is present, THEN THE SYSTEM SHALL reject the request and create no checkout.
- AC5: IF an open checkout exists for the same target and type, THEN THE SYSTEM SHALL return its URL and create no new session.
- AC6: IF PayMongo returns an error or a checkout URL whose host is not `checkout.paymongo.com`, THEN THE SYSTEM SHALL store no usable payment and show a retryable error.

Webhook

- AC7: THE SYSTEM SHALL accept PayMongo webhooks at `POST /api/webhooks/paymongo`, and `POST /api/paymongo/webhook` SHALL behave identically until removed.
- AC8: IF the signature is missing, invalid, for the wrong mode, or older than 300 seconds, or the body exceeds 1 MB, THEN THE SYSTEM SHALL respond 401 (413 for size) and change nothing.
- AC9: WHEN a verified event arrives, THE SYSTEM SHALL insert its event id into `payment_events` and process it in one transaction.
- AC10: IF the event id already exists, THEN THE SYSTEM SHALL respond 200 and make no further changes.
- AC11: IF processing fails, THEN THE SYSTEM SHALL roll back the event row and payment changes and respond 5xx so PayMongo retries.
- AC12: WHEN `checkout_session.payment.paid` matches a `pending` payment exactly (amount in centavos, PHP, livemode, reference), THE SYSTEM SHALL mark the payment `paid`.
- AC13: IF the paid event does not match exactly or references an unknown checkout session, THEN THE SYSTEM SHALL store the event, set a known payment to `review`, and not change any booking.
- AC14: WHEN `payment.failed` arrives for a pending payment, THE SYSTEM SHALL mark it `failed` and the owner MAY start a new checkout.

Confirmation and status

- AC15: WHEN verified paid payments for an `awaiting_payment` booking total at least 30% of the snapshot price, THE SYSTEM SHALL apply the booking module's `confirmed` transition in the same transaction, with a history row whose actor is the system.
- AC16: IF a verified payment arrives after the booking's payment hold expired or its dates were taken, THEN THE SYSTEM SHALL mark the payment `review` and leave the booking unconfirmed.
- AC17: THE SYSTEM SHALL never mark a payment `paid` or a booking `confirmed` from the return page, a client request, or a direct PayMongo API lookup.
- AC18: WHEN the owner opens the return page, THE SYSTEM SHALL show the payment's current status from `payments` (processing, paid, failed, expired, review) and only to that owner.
- AC19: WHEN a subscription payment is marked `paid` by webhook, THE SYSTEM SHALL apply the existing subscription activation logic once.

Migration

- AC20: WHEN the migration runs, THE SYSTEM SHALL copy existing `soundstage-paymongo:` records into `payments` with mapped status, skip already-migrated ones, and leave the JSON records unchanged.

## Non-functional and operational checks

| Area | Requirement or `not applicable` with reason | Evidence |
| --- | --- | --- |
| Security | Secrets server-only; signature verified on raw body before parsing; constant-time comparison; amounts server-computed; ownership checked; parameterized SQL. | Extended `tests/paymongo.cjs`; tests for forged, replayed, duplicate, mismatched events; bundle grep for `sk_`. |
| Privacy | Payment status visible only to the owner and admins; no card data stored. | Review of return-page query and table columns. |
| Accessibility | Return-page status is announced (`aria-live`) and actions are keyboard reachable. | Manual check. |
| Performance | Webhook does one transaction; indexed lookups by checkout session id and target. | Schema review. |
| Observability | Every event stored in `payment_events`; `review` and failures logged without secrets or full payloads. | Log review; tests. |
| Rollback | Additive tables; JSON payment records intact; old webhook URL still works. | Migration review. |

## Follow-ups

- Remove `/api/paymongo/webhook` after switching the PayMongo dashboard.
- Admin screen for `review` payments.
- Refund payouts through PayMongo.

## Change log

- 2026-10-09: revision 1 approved by the user.
- 2026-10-09: revision 2; changed Out of scope wording only; affected plans none; reason: payroll master owns refund decisions (ADR 0004).
- 2026-10-09: revision 3; changed D3; affected plans none (not yet planned); reason: user approved the refund module (20261009-refund-module).
