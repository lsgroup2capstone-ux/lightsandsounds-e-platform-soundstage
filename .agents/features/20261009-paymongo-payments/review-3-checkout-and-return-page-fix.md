# Review 3: Checkout and return page, fix rounds 1-2

- Plan: `plan-2-checkout-and-return-page.md`; spec rev 4 (D7 = booking `total`)
- Prior round: `review-2-checkout-and-return-page.md` (B1, m1-m5)
- Fixes reviewed: `impl-2` "Fix round 1" and "Fix round 2"
- Reviewer independence: fresh reviewer agent; did not implement any of this work.
- Baseline: uncommitted working tree on `bafd824`, mixed with the user's hub split and idle-logout work. Only the payment/booking files named below were judged.

## Checks run in this session

- `npm test`: 153/153 pass, exit 0
- `npx tsc --noEmit -p .`: exit 0
- `npm run build`: exit 0
- Lint: not runnable (no ESLint config, pre-existing)

## Verdict: changes-requested

## Prior findings

- B1 fixed: `bookings/core.ts:124` selects `coalesce(total, package_price) as price`; `core.ts:158,177,197` and `payments/checkout.ts:50-61` use it. `webhook.ts` and `ledger.ts` match the stored payment `amount` and never read `package_price`. No other payment use of `package_price` remains (`compat.ts:51` uses it only as the fallback when `total` is null).
- m1, m2 fixed: `checkout.ts:18-19` (pending without URL gives 409) and `checkout.ts:37-40` (`23505` gives 409). The `23505` branch is untested (needs concurrency); accepted.
- m3: the report records the overlap with booking plan 4; handle at ship time.
- m4 recorded in the report. m5 remains operational (real webhook secret), see below.

## Major

**M1. A rounded-down downpayment never confirms the booking.** `checkout.ts:55` charges `Math.round(0.3 * total)`, but `core.ts:158,177,197` require `paid >= 0.3 * total` unrounded. Whenever `0.3 * total` has a fraction below .5, the client pays the exact checkout amount and the booking stays `awaiting_payment` until it expires. Verified with node: total 13801 is charged 4140 < 4140.3; total 10001 is charged 3000 < 3000.3. With `total = round(price * multiplier) + transportation fee`, such totals are ordinary. Before B1 the basis was usually a round package price, so the fix round exposed this.

Required fix: one shared helper (for example `downpaymentFor(total) = Math.round(0.3 * total)`) used by `checkout.ts:55`, the three `core.ts` checks (`paid >= downpaymentFor(price)`), `compat.ts:67` (`downpayment` and `paid`) and `scripts/db/migrate-bookings.cjs:165`. Add a test with a total such as 13801 where paying the checkout amount confirms.

## Minor

- m1. `tests/data/system-activity.cjs` was changed outside the plan at the user's request; ship it as a separate commit or name it in the ship message.

## AC mapping

Unchanged from review-2 except AC3 (downpayment from the server `total`): the amount source passes (new 2-day test in `tests/paymongo-checkout.cjs`), but confirmation fails for rounded-down totals (M1).

## Unverified manual / operational checks

- PayMongo test-mode checkout and webhook with a real `PAYMONGO_WEBHOOK_SECRET`; rerun the T2.1 bundle grep with the real secret.
- Return page with screen reader and keyboard.

## Expert skills

None beyond the sdd-review workflow.
