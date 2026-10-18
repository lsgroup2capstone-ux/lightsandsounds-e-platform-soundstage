# Review 7: Data migration, fix rounds 1-2

- Plan: `plan-5-data-migration.md`; prior round `review-5-data-migration.md` (M1, m1-m5)
- Fixes reviewed: `impl-5` fix rounds 1-2; `database/README.md`
- Reviewer independence: fresh reviewer agent.
- Baseline: uncommitted tree on `bafd824`.

## Checks run in this session

- `npm test` 153/153 (includes `tests/migrate-bookings.cjs`); `npx tsc --noEmit -p .` exit 0; `npm run build` exit 0; lint not runnable.
- `npm run bookings:migrate` NOT run (non-local DB, unauthorized).

## Verdict: pass

## Prior findings

- M1 fixed: a rejected refund writes `null -> cancelled -> refund_pending -> cancelled` with the payout details and reason, so the `refundable` check sees the `refund_pending` row. Tested ("a rejected refund keeps its history..."); not exercised end to end through `requestBookingRefund` (accepted).
- m1 fixed: the export `paid` flag uses `total`; `package_price` keeps the package snapshot, which is no longer the payment basis.
- m2 fixed and tested (invalid `cancelledBy` is reported as unmappable).
- m3 fixed and tested (names, `requestedAt`, `Rejected`).
- m4 fixed in `database/README.md`. m5 accepted.

## Minor

- m1. `scripts/db/migrate-bookings.cjs:165` uses `paid >= 0.3 * total` while `:177` exports `round(0.3 * total)`; the same rounding mismatch as review-6 M1. Use the shared helper when that is fixed. Not blocking: the export only matters for rollback.

## Unverified manual / operational checks

- Local migration dry run, then `--execute` against the real database (user-run).

## Expert skills

None beyond the sdd-review workflow.
