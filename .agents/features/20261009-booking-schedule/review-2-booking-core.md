---
artifact: review
schema: 1
feature: 20261009-booking-schedule
revision: 2
status: approved
risk: high-risk
---

# Review 2: Booking core domain

- Plan: `plan-2-booking-core.md`
- Spec: `spec.md` (revision 4)
- Reviewer: Claude Code, separate review session (`/sdd-review`)
- Independent from implementation: yes (this session did not implement plan 2)
- Baseline: HEAD `18440c2`. The working tree also holds the user's large uncommitted restructure (route groups, `lib/`/`tests/` folder moves), so plan-2 changes cannot be isolated by `git diff` alone.
- Diff scope: new `lib/server/bookings/rules.ts`, `lib/server/bookings/core.ts`, `tests/bookings.cjs`; in `lib/server/runtime.ts` the `Tx` type, `tx` in the context, `currentTx()`; in `lib/server/data-service.ts:410` `tx` in `state`; in `package.json` `tests/bookings.cjs` appended to `test`. The import-path changes in those files belong to the user's restructure and were not judged.

## Round 1 (2026-10-17)

- Scope reviewed: all (phases 1–3)
- Verdict: changes-requested

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `node --test tests/bookings.cjs` | 7/7 pass |
| `npm test` | 121/122; only failure `tests/data/system-activity.cjs`, pre-existing at HEAD (proven in review 1) |
| `npm run typecheck` | pass |
| lint / build | not in the plan's routine checks; not run |

### Acceptance

| Criterion | Met? | Evidence |
| --- | --- | --- |
| AC7 | yes | `core.ts` `createBooking` insert + `history(…, null, "pending")`; test "create stores a pending booking…" |
| AC8 (evidence; owned by plan 1) | yes | same test edits the service after create; snapshot unchanged |
| AC9 | yes | `isBookable`, `findService`/approval check; test "create rejects unavailable bookings…" (past, blocked, weekday, overlap, inactive, unapproved, invalid date; zero rows) |
| AC10 | yes | idempotency lookup at start of `createBooking`; test 1 |
| AC11 | yes, for the plan's subset | `rules.ts` `TRANSITIONS`; table-driven test 3. Refund rows deferred to refund module as the plan says |
| AC12 | yes | `apply` + `history` in the request tx; test 4 stubs history failure → status unchanged |
| AC13 | yes | `lockOwned` identical 404 for missing / not owned; test 4 |
| AC14 | yes (plan fallback) | conditional `UPDATE … AND status = $from` in `apply`; test 5 (PGlite serializes, stale-status case covered) |
| AC16 | partly | `confirmFromPayment` checks ≥30%; but `transition(id, "confirmed", system)` confirms with no payment check (F1) |
| AC17 | yes (domain side) | `confirmFromPayment` returns `dates_taken`; marking the payment `review` is the payments plan's job; test 6 |
| AC20 | yes | `expireHolds` before create and before accept; test 6 |

### Traceability

| Task | Test/evidence | Result |
| --- | --- | --- |
| T2.1 | `runtime.ts` `currentTx`, `data-service.ts:410`; suite unchanged apart from known failure | met |
| T2.2 | test 1 | met |
| T2.3 | test 1 | met |
| T2.4 | test 2 | met |
| T2.5 | test 1 | met |
| T2.6 | test 3 | met |
| T2.7 | test 4 | met |
| T2.8 | test 4 | met |
| T2.9 | test 5 (fallback) | met |
| T2.10 | test 6 | met at `confirmFromPayment`; see F1 |
| T2.11 | test 6 | met |
| T2.12 | test 6 | met |

### Findings

| # | Severity | Finding | Where | Required fix |
| --- | --- | --- | --- | --- |
| F1 | major | The `awaiting_payment → confirmed` (system) rule has no checks, so the exported `transition(id, "confirmed", SYSTEM)` confirms a booking with zero payment and without the dates-taken check. The ≥30% and overlap conditions (D6, AC16, AC17) live only in `confirmFromPayment`. In this high-risk lane the money condition must be enforced by the domain, not by caller discipline before plan 4 wires actions. | `lib/server/bookings/rules.ts:15`, `lib/server/bookings/core.ts` `transition` | Make `confirmed` unreachable through `transition` (e.g. `transition` rejects `to === "confirmed"`; `confirmFromPayment` calls `apply` directly as it already does), or add a `paid` check to the rule that enforces `paidTotal ≥ 0.3 × package_price`. Add a test that `transition(id, "confirmed", system)` with paid total 0 is rejected and the status stays `awaiting_payment`. |
| F2 | minor | `confirmed → cancelled` (system) only checks a reason; nothing ties it to an approved cancellation request. Acceptable now because plan 3 owns requests. | `rules.ts:21` | Plan 3 should route this only through the approved-request path; note it there. |
| F3 | minor | A whitespace-only decline/cancel reason fails with "A required text field is invalid." instead of "A reason is required." | `core.ts` `text()` used in `transition` | Treat whitespace-only optional text as missing so the `reason` check produces its own message. |
| F4 | minor | `confirmFromPayment` reports `hold_expired` for every non-`awaiting_payment` status (e.g. already `confirmed`, `cancelled` by client). Documented in the report; payments may mislabel review reasons. | `core.ts` `confirmFromPayment` | Return the status or a distinct reason (e.g. `not_awaiting_payment`) when the status is not `awaiting_payment` and the hold had not expired. |
| F5 | minor | Idempotency key reused by another client returns "A request key is required.", which is misleading. No data leaks. | `core.ts` `createBooking` | Use a neutral message such as "This request key is already used." |

### Scope check

- Changes outside the plan: none attributable to plan 2. The `npm ci` reinstall and stopping `next dev` (impl report) were environment actions taken with the user's go-ahead; lockfile unchanged.
- File sizes: `core.ts` 187, `rules.ts` 29, test 206 lines (under 300). SQL is tagged-template only.

### Unverified manual or operational checks

- None required by the plan (nothing reachable from the UI). Real concurrent-transaction behavior on Supabase Postgres (AC14) is covered only by the PGlite fallback; verify once wired.

### Expert skills

- none (plan lists none; no applicable skill found for this review).

## Round 2 (2026-10-17)

- Scope reviewed: fix round 1 (F1, F3–F5; F2 deferred to plan 3)
- Reviewer: Claude Code, new `/sdd-review` session; independent from implementation and fix round: yes
- Diff scope: `lib/server/bookings/rules.ts`, `lib/server/bookings/core.ts`, `tests/bookings.cjs` (untracked, full files read)
- Verdict: pass

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `node --test tests/bookings.cjs` | 7/7 pass |
| `npm test` | 121/122; only failure `tests/data/system-activity.cjs` (pre-existing at HEAD, review 1) |
| `npm run typecheck` | pass |

### Findings from round 1

| # | Status | Evidence |
| --- | --- | --- |
| F1 major | fixed | `rules.ts:16` `downpayment` check; `core.ts:186` rejects with 409 when `paidTotal < 0.3 × package_price`; test `tests/bookings.cjs:160-164` (0 and 29% rejected, status stays `awaiting_payment`) |
| F2 minor | deferred | Plan 3 must route system `confirmed → cancelled` only through an approved cancellation request |
| F3 minor | fixed | `core.ts:61` whitespace treated as missing; test `tests/bookings.cjs:121` |
| F4 minor | fixed | `core.ts:211-214` `hold_expired` vs `not_awaiting_payment`; test 6. Fourth reason extends the plan's contract — payments plan must handle it |
| F5 minor | fixed | `core.ts:110`; test 1 |

AC16 is now fully met; all other AC/task mappings from round 1 stand.

### New findings

| # | Severity | Finding | Where | Required fix |
| --- | --- | --- | --- | --- |
| F6 | minor | A direct `transition(id, "confirmed", system)` skips the explicit dates-taken check that `confirmFromPayment` does; it relies on the database exclusion constraint (`23P01` → "These dates are already booked", `core.ts:167`). Safe, but the error differs from the `dates_taken` result. | `core.ts:176-192` | Optional: plan 4 should only confirm through `confirmFromPayment`. |

### Unverified manual or operational checks

- None required. AC14 on real Supabase Postgres still covered only by the PGlite fallback.

### Expert skills

- none (plan lists none; none applicable).
