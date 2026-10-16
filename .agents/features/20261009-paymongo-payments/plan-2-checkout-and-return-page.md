---
artifact: plan
schema: 1
feature: 20261009-paymongo-payments
revision: 1
status: plan-approved
risk: high-risk
---

# Plan 2: Server-computed checkout and status-only return page

- Feature: `.agents/features/20261009-paymongo-payments/spec.md`
- Design: `.agents/features/20261009-booking-schedule/design.md`
- Implements decisions: D5, D6 (checkout side), D7, D12
- Spec revision: 3
- Depends on: payments plan 1
- Status: plan-approved
- Estimate: about 300 lines of diff

## Goal

Booking and subscription checkouts are created only by server actions, with server-computed amounts, and stored in `payments`. One open checkout per target and type is reused. The return page only reads status.

## Evidence (checked in the repository)

- `lib/server/paymongo.ts:4-8`: `paymentKey()` validates `sk_test_`/`sk_live_` from env; `server-only` import at line 1.
- `lib/server/paymongo.ts:21-30`: `createCheckout(id, name, amount, method)` with the method map and `APP_URL` return URLs.
- `lib/server/data-service.ts:89-98`: `startPayment` writes JSON, errors on an unfinished checkout, and pins the host to `checkout.paymongo.com`.
- `lib/server/data-service.ts:300-306,307-321`: `createSubscriptionCheckout`, `cancelPayment` and `verifyPayment` (which settles without a webhook, against D5/AC17).
- `app/payment/return/page.tsx:19`: calls `verifyPayment`/`cancelPayment`.

## Phases

### Phase 1: `lib/server/payments/checkout.ts`

- `startCheckout({ ownerEmail, targetKind, targetId, type, name, amount, method })`:
  - Look for a `pending` row for `(targetId, type)` with a stored URL. If found, return it (AC5).
  - Otherwise call `createCheckout`, validate the URL host, and insert a `pending` payment.
  - On a PayMongo error or a bad host, throw a retryable `RequestError` and insert nothing (AC6).
- Action `startBookingPayment(bookingId, type, method)`:
  - Client owner only.
  - Reject `args.length > 3` or any extra amount argument (AC4).
  - Amount:
    - `downpayment` = round(0.3 × `package_price`), only when `awaiting_payment` and nothing is paid.
    - `full` = price − paid, when `awaiting_payment`.
    - `balance` = price − paid, only when `confirmed` and the balance is above 0 (AC3, AC4).
- `createSubscriptionCheckout`: same `startCheckout` with `targetKind:'subscription'`.
- Action `getPaymentStatus(id)`: owner (or admin) only; returns `{status, kind, checkoutUrl?}` from `payments` (AC18).
- `cancelPayment(id)`: owner only. Calls PayMongo `/expire` and sets the status to `expired`. It never sets `paid`.
- Remove `verifyPayment`, `settlePayment`, `startPayment` and the JSON payment code (AC17).

### Phase 2: Return page

- `app/payment/return/page.tsx`:
  - Poll `getPaymentStatus` every 3 s for up to 2 minutes.
  - Messages:
    - "Payment processing…"
    - "Payment confirmed"
    - "Payment failed — you can try again"
    - "Checkout expired"
    - "Payment under review — contact support"
  - The message element is `role="status" aria-live="polite"`. Keep the Resume and Cancel buttons.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T2.1 | none | `paymongo.ts` usage | AC1 | `tests/paymongo.cjs` secret non-exposure stays green; `npm run build`, then grep `.next/static` for `sk_` and the webhook secret → none |
| T2.2 | T2.1 | `checkout.ts` | AC2 | missing/malformed keys → checkout refused with non-secret message; webhook refused (plan 1 path) |
| T2.3 | T2.1 | `checkout.ts` | AC3 | `tests/paymongo-checkout.cjs`: `awaiting_payment` downpayment → pending payment with server amount |
| T2.4 | T2.3 | `checkout.ts` | AC4 | non-owner, wrong status, second downpayment, extra amount arg → rejected, PayMongo stub not called |
| T2.5 | T2.3 | `checkout.ts` | AC5 | second request → same URL, stub called once |
| T2.6 | T2.3 | `checkout.ts` | AC6 | stub error / `evil.com` URL → error, no payment row |
| T2.7 | T2.3 | data-service | AC17 | `verifyPayment` absent from `actions`; return-page flow never changes payment or booking status |
| T2.8 | T2.3 | return page, `getPaymentStatus` | AC18 | other user → 404; owner sees each status; manual screen-reader/keyboard check |

## Tests

- New `tests/paymongo-checkout.cjs` added to `npm test`; update `tests/billing.cjs` for the subscription checkout path.

## Out of scope

- From the spec:
  - Refund payouts.
  - Admin `review` UI.
  - Subscription pricing.
  - Old URL removal.
  - New payment methods.
- Deferred: the "Pay" buttons on the client dashboard (booking plan 4).

## Acceptance

- Spec: AC1, AC2, AC3, AC4, AC5, AC6, AC17, AC18.
- Technical: amounts are never read from the client.

## Verification

- Routine local checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
- Scoped operations: none.
- Manual: in PayMongo test mode, pay a subscription. The return page shows "processing", then "confirmed" after the test webhook arrives.

## Expert skills to apply

- none

## Risks and stop points

- Existing subscription UI (`components/payment/subscription-panel.tsx`) depends on the `verifyPayment` result shape → adapt it to `getPaymentStatus`. If that needs more than a small change, stop and report.
