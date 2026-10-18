---
artifact: review
schema: 1
feature: 20261009-booking-schedule
revision: 1
status: changes-requested
risk: high-risk
---

# Review 5: Migrate JSON bookings, schedules and payments

- Plan: `plan-5-data-migration.md`
- Report: `impl-5-data-migration.md`
- Spec: `spec.md` (revision 4); design: `design.md` (U2); payments spec revision 3 (AC20)
- Reviewer: Claude Code, fresh review session
- Independent from implementation: yes (did not implement in this session)
- Baseline: `bafd824` plus the uncommitted tree. This plan's files are all new or clearly separate: `scripts/db/migrate-bookings.cjs`, `tests/migrate-bookings.cjs`, the `bookings:migrate` line in `package.json`, and `database/README.md`. Plan 4 and payments plan 2 are also uncommitted in the same tree.

## Checks run in this session

- `node --test tests/migrate-bookings.cjs`: 5/5 pass.
- `npm test` (same tree, earlier in this session): 149/150. The only failure is `tests/data/system-activity.cjs`, a known failure that predates this work.
- `npx tsc --noEmit -p .`: exit 0 (same tree).
- Scoped operation **not run**: `npm run bookings:migrate`. The target is `SUPABASE_DB_URL`, which the implementer reports is non-local, and running it was not authorized.

## Verdict: changes-requested

### Major

**M1. A rejected refund is lost, so the client can request a refund again.** In `migrate-bookings.cjs:23`, `Cancelled` + refund `Rejected` maps to `cancelled` (correct per U2). But `migrate-bookings.cjs:72` then writes only the `null → cancelled` history row. Plan 4's `refundable` check (`core.ts:162-166`) decides "one request" by looking for a `refund_pending` history row. After migration, a client whose refund was rejected (with a provider cancellation and a migrated paid payment) can file a new refund request. That contradicts the spec transition table ("one request", spec line 68). The rejection reason and payout details are also dropped, so the projection and export show no refund.
- Required fix: for `Cancelled` with `refund.status === 'Rejected'`, write `null → cancelled` ("migrated from JSON"), then `cancelled → refund_pending` (reason `{method, account}`), then `refund_pending → cancelled` (reason `refund.reason || 'migrated from JSON'`). Add a test to `tests/migrate-bookings.cjs` showing that the migrated row exists, the projection shows refund "Rejected", and `requestBookingRefund` on it fails with "A refund request already exists".

### Minor (do not block)

- m1. `migrate-bookings.cjs:56`: `package_price = basePrice ?? total`. Legacy `basePrice` is the single-day service price, so migrated rows carry the same price-basis question as payments review-2 B1 and booking review-4 B1. Fix: once the user picks the basis, store that value, and check that legacy paid `Pending`/`Confirmed` amounts (30% of `total`) still pass the downpayment check.
- m2. `migrate-bookings.cjs:66`: a `cancelledBy` value outside the column's allowed set raises a non-`23P01` error, which aborts the whole run. This fails safely, but the operator gets only an error code. Fix: report it as `unmappable` with the reason "invalid cancelledBy".
- m3. Export (`migrate-bookings.cjs:162`): `provider` and `client` are written as `''`, so reverted legacy screens show blank names. `requestedAt` is also `''`. Fix: fill names from `soundstage-accounts-v2` (read-only), as `compat.ts` `names()` does, and use the `refund_pending` history `created_at`.
- m4. The export covers bookings only. Blocked dates and payments are not written back. That is acceptable, because the JSON copies are never modified, but `database/README.md` should say so.
- m5. The plan path `scripts/migrate-bookings.cjs` became `scripts/db/migrate-bookings.cjs`. The report explains this (repo restructure), so it is accepted.

## Decisions / design check

- D1 (migration): pass. The script runs in one transaction under advisory lock `74832019`, is a dry run by default, is idempotent through `legacy_id`, and never writes `soundstage.records`.
- U2: pass for every row except the incomplete history for rejected refunds (M1). `Confirmed` unpaid → unmappable (`:40`), which is correct.
- Payments D5: a legacy `paid` booking with no PayMongo record gets no `payments` row, so it stays unpaid. That is correct, and the report says so.

## AC / task mapping

| Item | Evidence | Result |
| --- | --- | --- |
| AC4 / T5.1 | test 1: dry run writes nothing; execute counts; rerun 0 migrated / 6 skipped; records byte-identical | pass |
| AC5 / T5.2 | test 2: four unmappable rows with reasons, none inserted | pass |
| AC6 / T5.3 | test 3: `{BK-CLASH, conflictsWith: BK-CONF}`, a savepoint per row (`:58-81`) | pass |
| Payments AC20 / T5.4 | test 4: mapped statuses, rerun skips, orphan reported, paid `Pending` → accept → `confirmed` | pass |
| T5.5 (rollback export) | test 5: round-trips the legacy shape; read-only | pass (m3) |
| Refund history | none | **fail (M1)** |

## Scope

- Only plan files. `package.json` adds the script line and the test file. `database/README.md` documents the run order and the approval rule.

## Unverified manual / operational checks

- A dry run against a **local** database, followed by the user reviewing the counts and the `unmappable`/`conflicts` lists.
- Any `--execute` on a shared or production database needs the user's explicit request (target: `SUPABASE_DB_URL`).

## Expert skills

- none applicable (the plan lists none)
