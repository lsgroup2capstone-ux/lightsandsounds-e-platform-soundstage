# Review 9: plan 5 data migration (fix round 3)

Verdict: **pass**

- scripts/db/migrate-bookings.cjs:165 paid flag now uses `Math.round(0.3 * total)`, matching core `downpaymentFor`; line 177 downpayment uses the same rounding. No other change. Plan 5 remains approved (review-7).

Checks (run this session): npm test 154/154 pass (0 fail); npx tsc --noEmit -p . exit 0; npm run build success. Lint not runnable (no ESLint config, pre-existing). bookings:migrate not run.
Manual outstanding: PayMongo test-mode webhook with real secret, screen reader on return page, UI click-through, local migration dry run.
