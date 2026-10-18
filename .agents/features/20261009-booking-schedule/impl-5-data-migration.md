---
artifact: implementation-report
feature: 20261009-booking-schedule
plan: plan-5-data-migration.md
status: shipped
---

# Implementation report 5: Migrate JSON bookings, schedules and payments

Scope: the whole plan. Built on plan 4 (`impl-4-rewire-and-compatibility.md`, not yet reviewed) and payments plans 1–2.

## Files

- `scripts/db/migrate-bookings.cjs` (new). The plan says `scripts/migrate-bookings.cjs`, but scripts moved into `scripts/db/` in commit `a6f8a1e`.
  - `migrateBookings(sql, { execute })` runs in one transaction under advisory lock `74832019`.
  - **Bookings:**
    - The client comes from the key and the provider from the service owner. Status follows design U2. `legacy_id` = booking id. Start and end come from `date` + `durationDays`. The snapshot uses the booking's own `packageName`/`basePrice`/`total`, plus time, type, location, town, guests, notes, image, `cancelled_by` and feedback.
    - `ON CONFLICT (legacy_id) DO NOTHING` → `skipped`.
    - Each insert runs in a `SAVEPOINT`. An exclusion violation (`23P01`) rolls back only that row and is reported as `{legacy_id, conflictsWith}`.
    - Unmappable → `{legacy_id, reason}`: unknown status, missing provider, missing or invalid dates, or `Confirmed` but unpaid.
  - **PayMongo records → `payments`:** `paid` → `paid`; anything else → `expired` (`cancelled` included). `target_id` = the migrated booking id, or the subscription email. `type` = `downpayment` or `subscription`. Idempotent. A booking payment whose booking was not migrated → `unmappable`.
  - **Blocked dates → `availability_schedules`** with `ON CONFLICT DO NOTHING`. Invalid dates are counted.
  - The dry run computes the same result and then rolls back.
  - `--export <file>` (`exportBookings`) reads table bookings and payments and writes `{ "soundstage-client-bookings-v3:<email>": Booking[] }` in the legacy shape. It is read-only.
- `tests/migrate-bookings.cjs` (new, 5 tests), added to `npm test`.
- `package.json`: `bookings:migrate`.
- `database/README.md`: run order (db:init → dry run → `--execute` locally; other environments need explicit approval; the `btree_gist` note).

## Deviations and notes

- **History rows for refund statuses:** these get more than one history row, so the refund screens find the payout details where plan 4 stores them (the `refund_pending` history reason):
  - `refund_pending`: `null → cancelled` ("migrated from JSON"), then `cancelled → refund_pending` (reason `{method, account}`).
  - `refunded`: the same, plus `refund_pending → refunded` (reason = payout reference).
  - Every other status gets the single "migrated from JSON" row from the plan.
- **Paid flag needs a payment row:** a legacy `paid` booking with no `soundstage-paymongo:` record (for example a demo payment) is migrated, but has no `payments` row, so the projection and export show it unpaid. This follows payments D5 (paid only from verified money). Test T5.5 asserts it.
- **`paid_at` is left null** for migrated payments, because the legacy record has no payment time. `method` is "PayMongo (migrated)".
- **The script never writes `soundstage.records`.** T5.1 compares every record byte for byte before and after.

## Checks (run this session)

- `node --test tests/migrate-bookings.cjs`: 5/5.
- `npm test`: 149/150. The one failure is the known `tests/data/system-activity.cjs`.
- `npm run typecheck`: pass.
- **Scoped operation not run:** `.env.local` `SUPABASE_DB_URL` points at a non-local host (checked by hostname only; the value was not printed). By the plan's stop point, neither the dry run nor `--execute` was run; only the PGlite tests.

## AC evidence (`tests/migrate-bookings.cjs`)

- AC4: test 1 (T5.1):
  - The dry run reports 6 migrated, 1 conflict and 4 unmappable, and writes no rows.
  - `--execute` gives the same counts, the mapped statuses, history rows and snapshot.
  - The rerun gives 0 migrated and 6 skipped (blocked dates 0/2).
  - The JSON records are byte-identical afterwards.
- AC5: test 2 (T5.2): the four unmappable rows with reasons, none inserted.
- AC6: test 3 (T5.3): `{legacy_id: 'BK-CLASH', conflictsWith: 'BK-CONF'}`; the conflicting row is not inserted.
- Payments AC20: test 4 (T5.4):
  - Mapped statuses (paid, expired, expired subscription); the rerun skips 3.
  - The orphan payment is reported.
  - A migrated paid `Pending` booking goes straight to `confirmed` when the provider accepts.
- T5.5: test 5: the export keeps the legacy fields, statuses, feedback, `cancelledBy` and refund details; the database row count is unchanged.

## Not done

- A real dry run against a local database, then a user review of the counts and lists (manual verification step).

## Expert skills

- none (the plan lists none)

## Fix round 1 (review-5 M1 and m1, 2026-10-17)

- `scripts/db/migrate-bookings.cjs`: `Cancelled` + refund `Rejected` now writes `null → cancelled`, then `cancelled → refund_pending` (`{method, account}`), then `refund_pending → cancelled` (the rejection reason). The `refundable` check therefore sees the earlier request.
- m1: the export `paid` flag now uses 30% of `total`. `package_price` keeps storing the legacy `basePrice` (the package snapshot). The payment basis is `total`, which migrations already store.
- New test: "a rejected refund keeps its history…" checks the three history rows, the payout details, the reason, and the exported status. The test asserts the history row `core.ts` reads; it does not call `requestBookingRefund` end to end.
- m2-m5 are not addressed.
- Checks (run this session): `node --test tests/paymongo-checkout.cjs` 9/9; `node --test tests/migrate-bookings.cjs` 6/6; `npm test` 151/152 (only the known `tests/data/system-activity.cjs`); `npx tsc --noEmit -p .` exit 0. Lint not runnable (no ESLint config); build not rerun.

## Fix round 2 (review-5 minors, 2026-10-17)

- m2: a `cancelledBy` value outside client, provider or system → `unmappable` ("invalid cancelledBy …"). It is tested.
- m3: the export fills `provider` and `client` names from the account records (read-only), sets `requestedAt` from the `refund_pending` history time, and exports rejected refunds as `refund.status: "Rejected"`. It is tested.
- m4: `database/README.md` says the export covers bookings only.
- Checks (run this session): `npm test` 153/153; `npx tsc --noEmit -p .` pass; `npm run build` pass. Lint not runnable (no ESLint config, pre-existing).

## Fix round 3 (review-7 minor, 2026-10-17)

- The export `paid` flag uses `Math.round(0.3 × total)`, the same rounding as `downpaymentFor`.
- Checks (run this session): `npm test` 154/154; `npx tsc --noEmit -p .` pass; `npm run build` pass.
