---
artifact: implementation-report
feature: 20261009-paymongo-payments
plan: plan-2-checkout-and-return-page.md
status: shipped
---

# Implementation report 2: Server-computed checkout and status-only return page

Scope: the whole plan. Built on commits `a6f8a1e` (restructure), `8e8f3ff` (booking plans 1-3) and `bafd824` (payments plan 1). The user confirmed on 2026-10-17 that the recorded "user decision" blocker was only the go-ahead to build this plan as written.

## Files

- `lib/server/payments/checkout.ts` (new):
  - `startCheckout` reuses a `pending` row for `(target_id, type)` (AC5); otherwise it creates the session, checks the host, and inserts the row. The payment id doubles as the PayMongo `reference_number`, which the plan 1 webhook matches exactly.
  - Errors: a PayMongo error or a foreign host → retryable `RequestError` 503 and no row (AC6). "Select a payment method." stays a 400.
  - `startBookingPayment`, `getPaymentStatus` and `cancelPayment` follow the plan. The cancel path calls `/expire`, sets `expired`, and never sets `paid`.
- `lib/server/data-service.ts`:
  - Removed: `paymentPrefix`, `PaymentRecord`, `readPayment`, `startPayment`, `settlePayment` and `verifyPayment` (AC17).
  - Added the actions `startBookingPayment` (refuses more than 3 args, AC4) and `getPaymentStatus` (client, provider or admin owner). `cancelPayment` now delegates.
  - `createSubscriptionCheckout` uses `startCheckout` with `targetKind: 'subscription'` and target id = provider email.
  - `saveClientBooking` still starts a downpayment checkout until booking plan 4. It now goes through `startCheckout` and also returns `bookingId`.
- `app/(client)/payment/return/page.tsx`: polls `getPaymentStatus` every 3 s for up to 2 minutes and shows the five plan messages in `role="status" aria-live="polite"`. Check again, Resume and Cancel are shown while the payment is pending.
- `tests/paymongo-checkout.cjs` (new, 8 tests), added to `npm test` in `package.json`.
- `tests/data/supabase-domain.cjs`: gives actions a PGlite transaction (`withTx`). The two `verifyPayment` tests are replaced by one status/cancel test (listed below). Legacy JSON bookings are seeded as test-mode paid.
- `tests/data/postgres-schema.cjs` "full server workflows": `verifyPayment` calls replaced by seeding the JSON booking as test-mode paid, plus a check that 2 pending `payments` rows exist; it uses `bookingId` from the new return shape.

## Replaced tests (not deleted silently)

- `supabase-domain` "subscription verification is idempotent and owner restricted" → "the return flow only reads payment status and never settles". The idempotent activation it covered is now webhook test 7 (`tests/paymongo-webhook.cjs`, AC19).
- `supabase-domain` "unpaid and incorrect amounts cannot settle; cancellation releases the booking" → the same new test plus `paymongo-checkout` AC17/AC18. Amount mismatch is webhook test 3 (AC13). **Behavior change:** cancelling a checkout no longer cancels the legacy JSON booking. Booking cancellation moves to `requestCancellation` in booking plan 4.

## Deviations and notes

- **Price basis:** amounts use `package_price`, as the plan says, not the booking `total` that includes transport. `full` and `balance` = `package_price − paid`. The reviewer should confirm this matches spec D7 ("snapshot price").
- **Interim gap until booking plan 4:** legacy JSON bookings can still start a checkout, but nothing can settle them. The webhook confirms only table bookings, and `confirmFromPayment` on a legacy id would throw, so PayMongo would retry. This is acceptable only because nothing deploys before the whole sequence (design U1).
- **Concurrency:** two concurrent first requests for the same target and type: the second hits the `payments_one_pending` unique index and errors. It does not create a second session row.
- `tests/payments/billing.cjs` was not changed: it never called the subscription checkout path.
- `components/payment/subscription-panel.tsx` needed no change: it reads only `checkoutUrl`.

## Checks (run this session)

- `node --test tests/paymongo-checkout.cjs`: 8/8 pass.
- `node --test tests/data/supabase-domain.cjs`: 7/7. `tests/data/postgres-schema.cjs`: 3/3.
- `npm test`: 140/141. The failure is `tests/data/system-activity.cjs`, known and failing on every commit since `a6f8a1e` (proven in this session's snapshot runs).
- `npm run typecheck`: pass.
- `npm run lint`: **not runnable.** ESLint 10 finds no `eslint.config.*`. This is pre-existing and unrelated.
- `npm run build`: pass. The working tree includes other uncommitted work (idle logout, hub split).
- T2.1 bundle check: `.next/static` contains no `sk_test_`/`sk_live_` key pattern, no variable names, and not the configured `PAYMONGO_SECRET_KEY` value. The configured `PAYMONGO_WEBHOOK_SECRET` in `.env.local` is **one character long**, so a value grep matches everywhere and proves nothing. Separately, the local webhook secret looks like a placeholder; set the real one before the manual check.

## AC evidence (`tests/paymongo-checkout.cjs` unless noted)

- AC1: no secret in the bundle (above); `tests/payments/paymongo.cjs` still green.
- AC2: test 6, missing or `pk_` key → 503 with a message that contains no key; no row.
- AC3: test 1, downpayment 3000 of 10000 and full 10000, pending row, reference = payment id.
- AC4: tests 2-3: outsider 404, provider 403, wrong status/type, second downpayment, and an extra amount argument are all rejected with no PayMongo call; balance 7000 after confirmation.
- AC5: test 4, same id and URL, one PayMongo call.
- AC6: test 5, thrown error and `evil.com` host → 503, zero rows.
- AC17: test 8 (source has no `verifyPayment`/`settlePayment`/JSON prefix); `supabase-domain` new test (`actions.verifyPayment` is undefined; status reads and cancel leave billing unchanged).
- AC18: test 7: owner and admin read; outsider and a bad id → 404; each status is reported; cancel → `expired` and the booking stays `awaiting_payment`.

## Not done

- Manual: in PayMongo test mode, pay a subscription and watch "processing" turn into "confirmed" through the test webhook. This needs a tunnel and a real webhook secret.
- Manual screen-reader and keyboard check of the return page.

## Expert skills

- none (the plan lists none)

## Fix round 1 (review-2 B1, 2026-10-17)

- The user chose the booking `total` as the snapshot price. Spec D7 is now revision 4 and the plan has been updated.
- `lib/server/bookings/core.ts`: `lockOwned` also selects `coalesce(total, package_price) as price`. The three downpayment checks (`transition` "downpayment", the accept path and `confirmFromPayment`) use `row.price`.
- `lib/server/payments/checkout.ts:41`: downpayment, full and balance use `row.price`.
- New test in `tests/paymongo-checkout.cjs`: a 2-day booking with `total` 13800 and `package_price` 10000. The downpayment is 4140; 3000 paid does not confirm; 4140 confirms; the balance is 9660.
- Checks (run this session): `node --test tests/paymongo-checkout.cjs` 9/9; `node --test tests/migrate-bookings.cjs` 6/6; `npm test` 151/152 (only the known `tests/data/system-activity.cjs`); `npx tsc --noEmit -p .` exit 0. Lint not runnable (no ESLint config); build not rerun.

## Fix round 2 (review-2 minors, 2026-10-17)

- m1 and m2 (`checkout.ts`): a pending row without a URL, or a concurrent insert that hits `payments_one_pending` (`23505`), now returns a retryable 409 ("already being started") and creates no row. The new test covers the pending-without-URL case. The `23505` branch has no test, because it needs two concurrent transactions.
- m4: the return page ignores `cancelled=1` on purpose. Cancelling is the explicit "Cancel checkout" button.
- m5 is not fixable in code: the local `PAYMONGO_WEBHOOK_SECRET` is one character long. Set the real secret before rerunning the bundle grep and the manual webhook check.
- Unrelated pre-existing failure fixed at the user's request ("fix everything"): `tests/data/system-activity.cjs` had mock module paths from before the `a6f8a1e` restructure, and link expectations from before refunds and payments left the admin area (`bcbd0dd`). The paths and expected `/admin/activity#…` anchors are updated; the code is unchanged.
- Checks (run this session): `npm test` 153/153; `npx tsc --noEmit -p .` pass; `npm run build` pass. Lint not runnable (no ESLint config, pre-existing).

## Fix round 3 (review-3 M1, 2026-10-17)

- New `downpaymentFor(total) = Math.round(0.3 × total)` in `lib/server/bookings/core.ts`. It is the one amount used by checkout (`checkout.ts`), the three confirm checks (`core.ts`), the projection's `paid` and `downpayment` (`compat.ts`), and the migration export (the same rounding inline in `.cjs`).
- New test: with total 13801 the checkout charges 4140, and paying exactly that confirms the booking.
- review-3 minor: `tests/data/system-activity.cjs` should be named in the commit, or shipped separately.
- Checks (run this session): `npm test` 154/154; `npx tsc --noEmit -p .` pass; `npm run build` pass.
