# Review 4: plan 2 checkout and return page (fix round 3)

Verdict: **pass**

## Prior finding
- M1 (review-3) resolved: `downpaymentFor = Math.round(0.3 * total)` in lib/server/bookings/core.ts:11 is used by checkout.ts:54 and by every confirm check (core.ts:160, 179, 199) and compat.ts:66. New test at end of tests/paymongo-checkout.cjs covers the rounded threshold. Grep of lib/, scripts/, components/, app/ finds no other unrounded 0.3 threshold; booking-flow.tsx:64 and services/[id]/page.tsx:138 display Math.round values consistent with the server.

## Minors
- None blocking. Client display formulas duplicate the 0.3 constant rather than importing the helper (display only).

Checks (run this session): npm test 154/154 pass (0 fail); npx tsc --noEmit -p . exit 0; npm run build success. Lint not runnable (no ESLint config, pre-existing). bookings:migrate not run.
Manual outstanding: PayMongo test-mode webhook with real secret, screen reader on return page, UI click-through, local migration dry run.

Ship together with booking plans 4 and 5 (shared uncommitted tree), order payments 2 -> booking 4 -> booking 5.
