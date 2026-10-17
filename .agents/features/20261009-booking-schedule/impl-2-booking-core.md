---
artifact: implementation-report
feature: 20261009-booking-schedule
plan: plan-2-booking-core.md
status: ready-for-review
---

# Implementation report 2: Booking core domain

Scope: all three phases. The diff is about 470 lines including tests, but under 300 lines per source file. Started at the user's request while plan 1 was approved but not yet shipped.

## Files

- `lib/server/runtime.ts`: `Tx` type, optional `tx` in the request context, and `currentTx()`, which throws when no transaction is present.
- `lib/server/data-service.ts`: `execute()` puts its `tx` into the context state. No other behavior change.
- `lib/server/bookings/rules.ts` (new): `BOOKING_STATUSES`, the `TRANSITIONS` table as data, and `findRule`/`verb`.
- `lib/server/bookings/core.ts` (new): `isBookable`, `createBooking`, `transition`, `expireHolds`, `confirmFromPayment`, and `registerPaidTotal`. The default paid total is 0 until payments plan 1.
- `tests/bookings.cjs` (new) and the `npm test` script in `package.json`.

## Deviations and notes

- Refund transitions (`cancelled → refund_pending`, `refund_pending → refunded/cancelled`) are not in `TRANSITIONS`. The plan defers them to the refund module, so they are rejected for now.
- `admin` and `payroll_master` actors get `404 Booking not found` from `transition`, because the spec table gives them no transitions and ownership is checked before the rule.
- `package_price` is the service's unit price (the snapshot). `base_price`, `transportation_fee` and `total` reuse the current duration and transport pricing from `data-service.ts`. The 30% threshold uses `package_price`, per AC16.
- `confirmFromPayment` returns `hold_expired` for any status other than `awaiting_payment`.
- **AC14:** PGlite serializes transactions, so the test runs accept and decline concurrently (the loser sees the committed status), and also forces a stale status into the conditional `UPDATE` (zero rows → rejected, status unchanged). This is the plan's stated fallback.
- **Test placement:** `tests/bookings.cjs` sits at the root of `tests/` as the plan says, although the user's uncommitted restructure moved other tests into subfolders.
- **Environment:** `node_modules` was found partly deleted mid-run (`@electric-sql/pglite` missing). The likely cause is the plan 1 reviewer's temporary worktree cleanup through a junction; this is unconfirmed. With the user's go-ahead, the user's `next dev` server (port 8000) was stopped because it locked a file, and `npm ci` restored packages from `package-lock.json` (lockfile unchanged). The user must restart `next dev`.

## Checks (run this session)

- `node --test tests/bookings.cjs`: 7/7 pass. The first run had 2 failures caused by test-setup mistakes, both fixed in the test: accept→cancel is a legal sequence, and a held booking correctly blocks creating the rival booking.
- `npm test`: 121/122 pass. The failure is `tests/data/system-activity.cjs`, proven pre-existing at HEAD by the plan 1 review.
- `npm run typecheck`: pass.

## AC evidence

- AC7 (create, snapshot, history), AC8 evidence, AC10 (idempotency): test 1.
- AC9 (past, blocked, non-working day, overlap, inactive service, unapproved provider, invalid date): test 2.
- AC11 (table-driven rejection of every pair not in the table): test 3.
- AC12 (history failure rolls back), AC13 (other client, other provider, missing id → identical 404): test 4.
- AC14: test 5.
- AC16, AC17, AC20 (30% vs 29%, dates taken, expired hold cancelled with "payment expired" before a new create): test 6.
- D7 start-date rule, the paid client-cancel block, and legacy paid confirm on accept (design U2): test 7.

## Not done

- No browser wiring (plan 4); no real `paidTotal` (payments plan 1). No manual checks; nothing is reachable from the UI.
- Plan 1 review minors F1–F3 are not addressed here (plan 1 scope).

## Expert skills

- none (plan lists none).

## Fix round 1 (2026-10-17, for review-2 round 1)

Note: the same session wrote review-2, so the next review must be a new session.

| Finding | Fix | Evidence |
| --- | --- | --- |
| F1 major | `rules.ts`: new `downpayment` check on `awaiting_payment → confirmed` (system). `core.ts` `transition` rejects it with 409 "The downpayment has not been verified." when `paidTotal < 0.3 × package_price`. The dates-taken check stays in `confirmFromPayment`. The database exclusion (`23P01` → "These dates are already booked") still guards a direct confirm. | test 6: direct `transition(id, "confirmed", system)` at 0 and 29% rejected, status stays `awaiting_payment` |
| F2 minor | Not changed. Plan 3 owns cancellation requests and must route system `confirmed → cancelled` only through an approved request. | — |
| F3 minor | `text()` treats a whitespace-only value as missing, so the reason check says "A reason is required." | test 4: reason `'   '` → "reason is required" |
| F4 minor | `confirmFromPayment` returns `hold_expired` only when the booking is `cancelled` and its latest history reason is "payment expired". Other statuses return the new reason `not_awaiting_payment`. This adds a fourth reason to the contract the plan named. | test 6: already-confirmed → `not_awaiting_payment`; expired hold → `hold_expired` |
| F5 minor | A key reused by another client now gets "This request key is already used." | test 1 |

Checks (run this session):

- `node --test tests/bookings.cjs`: 7/7 pass.
- `npm test`: 121/122 pass. The failure is `tests/data/system-activity.cjs`, which was proven to fail at HEAD in review 1.
- `npm run typecheck`: pass.
- Sizes: `core.ts` 193 lines, `tests/bookings.cjs` 213 lines.
