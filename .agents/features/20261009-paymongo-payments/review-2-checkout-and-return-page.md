---
artifact: review
schema: 1
feature: 20261009-paymongo-payments
revision: 1
status: changes-requested
risk: high-risk
---

# Review 2: Server-computed checkout and status-only return page

- Plan: `plan-2-checkout-and-return-page.md`
- Report: `impl-2-checkout-and-return-page.md`
- Spec: `spec.md` (revision 3)
- Reviewer: Claude Code, fresh review session
- Independent from implementation: yes (did not implement in this session)
- Baseline: `bafd824` plus the uncommitted working tree. The diff cannot be cleanly isolated to this plan: `lib/server/data-service.ts`, `tests/data/*.cjs` and `lib/server/domain/client-bookings.ts` also hold uncommitted booking plan 4/5 work (`impl-4`, `impl-5`). This plan is judged on `lib/server/payments/checkout.ts`, `app/(client)/payment/return/page.tsx`, the payment actions in `data-service.ts:223-237`, `tests/paymongo-checkout.cjs` and `package.json`.

## Checks run in this session

- `node --test tests/paymongo-checkout.cjs`: 8/8 pass.
- `npm test`: 149/150. The only failure is `tests/data/system-activity.cjs`, a known failure that predates this work (recorded in tasks.md and in the impl report).
- `npx tsc --noEmit -p .`: exit 0.
- `npm run lint`: not run. No ESLint config exists, and that problem predates this work.
- `npm run build`: not rerun here. The report says it passed.

## Verdict: blocked (one user decision); the code otherwise passes

### Blocker (needs a user decision, not a code fix)

**B1. Which price do the payment amounts use?** `checkout.ts:42-55` computes downpayment, full and balance from `package_price`. `bookings/core.ts:101` stores `package_price = service.price`, which is the single-day price. It leaves out the multi-day multiplier and the transportation fee. Those are stored separately (`base_price`, `transportation_fee`, `total`, `core.ts:103-109`), and `total` is the amount the client sees. Example: a 3-day booking outside the coverage area shows a higher `total`, but the client is charged 30% of only the one-day price. Choosing `full` then leaves the booking "fully paid" below its displayed total. The plan and the design (`design.md:46`) say `package_price` is the snapshot, so the code follows the plan. But spec D7 says "booking snapshot price", and the cost of getting this wrong is real money. The reviewer cannot pick the answer.
- Required: the user picks the basis. **Recommended: the booking's `total`.** If the user picks `total`, update spec D7 and the plan, then change `checkout.ts` and the downpayment checks in `core.ts:158,177,197` to use the same basis, and add a multi-day test with a transport fee. If the user picks `package_price`, record that in D7 and close this finding.

### Major

- none

### Minor (do not block)

- m1. `checkout.ts:15-16`: a `pending` row with a null `checkout_url` skips the reuse branch. The insert then fails on the `payments_one_pending` unique index with a raw error. This cannot happen today, because every insert sets a URL. Fix: treat any `pending` row as open, or turn the unique-violation into a retryable `RequestError`.
- m2. Concurrent first requests (the report notes this): the second request fails on the unique index instead of reusing the checkout. Fix: catch unique-violation `23505` and either re-select and return the row or throw `RequestError(…, 409)`.
- m3. `impl-2` says `saveClientBooking` "still starts a downpayment checkout". In the current tree, `data-service.ts` delegates to `bookingCore.createBooking` and starts no checkout, which is booking plan 4's change. The report is out of date relative to the tree. Fix: correct it when this plan ships, and ship plan 2 and booking plan 4 knowing their diffs overlap.
- m4. The return page ignores `cancelled=1` (`page.tsx`). That is fine, because cancelling is now an explicit button, but say so in the report.
- m5. The T2.1 check for the webhook secret in the bundle proves nothing, because the local value is one character long. Rerun it with a real secret.

## Decisions check

- D5 (only the webhook settles): pass. `verifyPayment`, `settlePayment` and the JSON settlement code are removed. `getPaymentStatus` is read-only (`checkout.ts:72-75`).
- D6 (checkout side): pass. Host and protocol are pinned (`checkout.ts:31`), and the payment id is the reference.
- D7: amounts are computed on the server and never read from the client (pass). Whether the amount basis is correct is open, see B1.
- D12: pass. One pending checkout per `(target_id, type)` is selected `for update` (`checkout.ts:15`).

## AC mapping

| AC | Evidence | Result |
| --- | --- | --- |
| AC1 | `paymongo.ts` imports `server-only`; report's bundle grep (key value absent). `tests/payments/paymongo.cjs` passes in `npm test` | pass (webhook-secret grep weak, m5) |
| AC2 | `paymongo-checkout` "missing or malformed keys…" (503, no key in message) | pass |
| AC3 | "a downpayment checkout uses the server amount…" | pass (basis: B1) |
| AC4 | "wrong owner, status, type or a second downpayment…", "the action refuses a client-supplied amount" ( `data-service.ts:233`) | pass |
| AC5 | "a repeat request reuses the open checkout" | pass |
| AC6 | "a PayMongo error or foreign checkout host stores nothing" | pass |
| AC17 | "no browser action settles…"; `supabase-domain` return-flow test | pass |
| AC18 | "status is owner-only and read-only…"; `page.tsx` `role="status" aria-live="polite"` | pass in code; manual screen-reader/keyboard check outstanding |

Tasks T2.1-T2.8 are all present and match the rows above.

## Scope

- Plan files only, apart from the mixed booking plan 4/5 changes described in the Baseline line (not attributed to this plan). `subscription-panel.tsx` was not changed, which is correct because it reads only `checkoutUrl`. `tests/payments/billing.cjs` was not changed, and the reason is credible: it never called the checkout path.

## Unverified manual / operational checks

- PayMongo test mode: pay a subscription and watch "processing" change to "confirmed" when the webhook arrives. This needs a tunnel and a real `PAYMONGO_WEBHOOK_SECRET`.
- Return page with a screen reader and keyboard only.

## Expert skills

- none applicable (the plan lists none; no matching skill for this review step)

## User decision (2026-10-17)

- B1 resolved: the user chose the recommendation. All payment amounts use the booking **`total`** (multi-day price plus transportation fee) as spec D7's "snapshot price".
- Verdict is now **changes-requested**. Required, in order:
  1. Update spec D7 to say "`total`" and add a changelog row. Update the affected plans (payments plan 2, booking plan 4, booking plan 5) to match. Get approval for both.
  2. `/sdd-implement` fix round: `payments/checkout.ts` (downpayment, full and balance), `bookings/core.ts:158,177,197` (downpayment checks), `bookings/compat.ts:62` (`paid` flag) and `scripts/db/migrate-bookings.cjs` (`package_price`/export `paid`) all use one basis. Add a test where `total ≠ package_price`.
