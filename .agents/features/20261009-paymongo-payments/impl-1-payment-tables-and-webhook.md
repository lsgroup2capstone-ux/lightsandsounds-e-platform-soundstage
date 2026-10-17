---
artifact: implementation-report
feature: 20261009-paymongo-payments
plan: plan-1-payment-tables-and-webhook.md
status: ready-for-review
---

# Implementation report 1: Payment tables and verified webhook

Scope: the whole plan. It is built on booking-schedule plans 1–3, which are not yet shipped, and on top of the user's uncommitted folder restructure (new paths such as `lib/server/payments/paymongo.ts` and `tests/data/`).

## Files

- `database/schema.sql`: `payments` and `payment_events` tables with RLS, the 7-value status CHECK, `refunded_amount`, a unique `checkout_session_id`, the partial unique `(target_id, type) WHERE status='pending'`, and indexes on target and owner. Added in the same version-5 block as booking plan 1, because plan 1 is not shipped.
- `lib/server/payments/webhook.ts` (new): `handleWebhook(raw, signature)` and `processEvent(event)`.
- `lib/server/payments/ledger.ts` (new): `paidTotal(bookingId)` (sum of `paid`/`partially_refunded`), registered with the booking module. `data-service.ts` imports it for its side effect.
- `app/api/webhooks/paymongo/route.ts` (new); `app/api/paymongo/webhook/route.ts` re-exports `POST` and keeps its own `runtime`.
- `lib/server/data-service.ts`:
  - The subscription activation is extracted from `settlePayment` into the exported `activateSubscription()`; `settlePayment` now calls it.
  - The 5th `execute()` parameter was `webhookSession`. It is now a server-only `webhook` callback that runs inside the request transaction and context.
- `tests/paymongo-webhook.cjs` (new); `tests/data/postgres-schema.cjs` (role denial on both tables, the one-pending index, the status CHECK); `package.json` `test`.

## Deviations and notes

- **Extra columns** beyond the design contract: `owner_email` (ownership for plan 2 and the return page), `plan` (subscription plan to activate), `method`, `provider_reference`, `review_reason` (the AC13/AC16 "record the reason"), and `paid_at`.
- **Webhook runs through `execute()`:** the webhook does not open its own `sql.begin`. It goes through `execute()`, so it gets the same transaction, advisory lock and records `storage`, which subscription activation needs (AC19).
- **`payment.failed` matching is unverified.** The payment resource is matched by `reference_number`, `external_reference_number` or `metadata.reference_number` equal to our payment id. The real test-mode payload has not been seen (plan stop point). Confirm this with a redacted real payload before deployment.
- **Paid event for a non-pending payment:**
  - Already `paid`: no-op, so a duplicate confirmation never causes a second status change.
  - `failed`, `expired` or `review`: the payment is set to `review` with reason `paid event while <status>`, because money arrived that we no longer expected.
- **The old JSON settlement no longer runs from the webhook** (the plan says so). Until payments plan 2 moves checkout creation to the table, JSON checkouts settle only through `verifyPayment`. This is acceptable because nothing deploys before the whole sequence ships (design U1).
- **503 responses** cover processing errors and a missing `PAYMONGO_WEBHOOK_SECRET`/`PAYMONGO_SECRET_KEY` (AC2). Logs contain no payload or secret.

## Checks (run this session)

- `node --test tests/paymongo-webhook.cjs`: 8/8 pass.
- `npm test`: 133/134 pass. The failure is `tests/data/system-activity.cjs`, which already fails at HEAD (booking review 1).
- `npm run typecheck`: pass.

## AC evidence (`tests/paymongo-webhook.cjs`)

- AC7, AC8: test 1. The legacy route re-exports the handler. Missing, forged, old and wrong-mode signatures get 401, and a body over 1 MB gets 413. No event rows are written and the payment stays `pending`.
- AC9, AC10, AC12, AC15, booking AC19: test 2. An exact match → `paid` and the booking is `confirmed` by `system`; the event is linked to the payment. A replay, and a second event for the same session, add no history.
- AC13: test 3. A payment 1 centavo short, the wrong mode or the wrong reference → `review`, and the booking stays `awaiting_payment`. An unknown session is stored and gets 200.
- AC11: test 4. When confirm throws: 503, no event row, payment still pending. The retry succeeds.
- AC14: test 5. `payment.failed` → `failed`, and a new pending payment for the same target is then allowed. Other event types are stored only.
- AC16: test 6. When the hold has expired, the booking is `cancelled` and the payment is `review` with `review_reason = hold_expired`.
- AC19: test 7. The subscription plan and `paidUntil` are applied once, even when the event is sent twice.
- Booking AC18: test 8. No action name reaches `confirmFromPayment`, and `data-service.ts` never calls it.

## Not done

- Manual PayMongo test-mode webhook through a tunnel (plan manual check) was not done.
