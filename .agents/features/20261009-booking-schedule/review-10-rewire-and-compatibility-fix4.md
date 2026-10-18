# Review 10: plan 4 fix round 4 (refund list eligibility)

Verdict: **pass**
Reviewer: independent reviewer session, 2026-10-17
Scope: delta after review-8 ("Fix round 4" in impl-4-rewire-and-compatibility.md).

## Checked
- `lib/server/bookings/compat.ts:39,72`: `refundEligible` = cancelled AND paid > 0 AND no refund_pending row yet (`refund_reason` comes from that history row, line 38) AND (`cancelled_by = provider` OR an approved cancellation request). It matches the `refundable` check in `lib/server/bookings/core.ts:161-167` and the spec row `cancelled (paid) -> refund_pending` (spec.md:68). The server still enforces the check, so the flag only affects what is shown.
- `lib/marketplace/mock-data.ts:66`: optional field, so existing callers are unchanged.
- `components/payment/refunds-panel.tsx:14`: admin/payroll still filters on `refund` only. The client sees existing refunds plus eligible rows, and an eligible row without a `refund` shows the request form, which posts as before.
- Leakage: the flag is computed per row inside the projection, which is already scoped to the viewer. It adds no new fields about other users.
- `tests/bookings.cjs:260,264,277`: these assert that the flag is set for an eligible booking, cleared once a request exists, and absent for an unpaid booking.

## Checks (run this session)
- `npm test`: 154/154 pass
- `npx tsc --noEmit -p .`: exit 0
- `npm run build`: exit 0
- Lint: not run (pre-existing breakage)

## Findings
None blocking. Outstanding (unchanged): manual click-through; migration dry run.
