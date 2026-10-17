---
artifact: review
schema: 1
feature: 20261009-booking-schedule
revision: 3
status: approved
risk: high-risk
---

# Review 3: Reschedule, cancellation requests and availability

- Plan: `plan-3-requests-and-availability.md`
- Spec: `spec.md` (revision 4)
- Reviewer: Claude Code, separate review session (`/sdd-review`)
- Independent from implementation: yes (this session did not implement plan 3)
- Baseline: HEAD `18440c2`. `lib/server/bookings/` is untracked and the tree still holds the user's uncommitted restructure, so the plan-3 changes cannot be isolated with `git diff`.
- Diff scope: new `lib/server/bookings/availability.ts` (58 lines) and `requests.ts` (114 lines); in `core.ts` (untracked, 194 lines) the exports `assertBookable`, `lockOwned` and `paidTotal`; new `tests/bookings-requests.cjs`; `package.json` `test` script (appended).

## Round 1 (2026-10-17)

- Scope reviewed: all (phases 1–2)
- Verdict: pass

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `npm test` | 133/134. The only failure is `tests/data/system-activity.cjs`, which already fails at HEAD (shown in review 1). |
| `npm run typecheck` | pass |
| Scoped operations / manual | none in the plan |

### Acceptance

| Criterion | Met? | Evidence |
| --- | --- | --- |
| AC21 | yes | `requests.ts:36-48` checks the `RESCHEDULABLE` statuses; a `23505` error becomes 409 (`:26-34`); the `reschedule_one_pending` index is at `database/schema.sql:147`. Covered by the test "reschedule requests…". |
| AC22 | yes | `requests.ts:73-93` runs the decision, `expireHolds`, `assertBookable(excludeId)` and the date update in one transaction, and the error rolls everything back. Covered by the test "approving a reschedule…" (the request stays pending and the dates stay the same). |
| AC23 | yes | `requests.ts:95-114`. Covered by the test "cancelling…" (the booking stays `confirmed` until approval, then becomes `cancelled` with a system history row and `cancelled_by='client'`). |
| AC24 | yes | `decide` runs `where status='pending'` and returns 409 when no row changes (`requests.ts:64-71`). Covered by the double-decision assertions in both decision tests. |
| AC25 | yes | `availability.ts:135-153`; the shared `isBookable` is at `core.ts:41`. Covered by the test "availability…". |
| No file > 300 lines | yes | the largest file is `core.ts` at 194 lines |

### Spec decisions

D9 (single pending request per type, single decision, re-check on approval) and D10 (`availability_schedules`, server-side rejection) are respected. Nothing contradicts the spec.

### Traceability

| Task | Evidence | Result |
| --- | --- | --- |
| T3.1 | test 1 | met |
| T3.2 | test 2 | met |
| T3.3 | test 3 | met |
| T3.4 | tests 2 and 3 | met |
| T3.5 | test 4 | met |

### Findings

No blocker or major findings.

- **minor M1:** `availability.ts:156` `unavailableDates` does not validate `fromDate`/`toDate` or limit the range. An invalid or very large range can loop for a long time. Fix: when plan 4 adds the compatibility action, validate both dates with `validDate` and limit the range (for example, to 400 days).
- **minor M2:** Lock order is inconsistent. `requests.ts:51-59` locks the request and then the booking, while `requestReschedule`/`requestCancellation` lock the booking and then insert the request. This could deadlock under real concurrency. Fix: in `lockRequest`, read `booking_id` without `for update`, call `lockOwned` on the booking, and then lock the request row.
- **minor M3:** A pending reschedule or cancellation request stays `pending` after its booking is cancelled or completed some other way. Its decision then fails with a status error. Fix (later plan): decline the open requests when a booking reaches a terminal status, or filter them out in plan 4's lists.
- **minor M4 (documented deviation):** The decide functions take no decision reason because the schema has one `reason` column. This is acceptable, and the spec does not require one.
- **carry-over (review-2 F2):** plan 4 must not expose `transition(confirmed→cancelled, system)` to browsers.

### Expert skills

- none (the plan lists none, and no review-step skill applied)
