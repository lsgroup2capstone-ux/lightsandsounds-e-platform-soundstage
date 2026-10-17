---
artifact: review
schema: 1
feature: 20261009-paymongo-payments
revision: 1
status: pass
risk: high-risk
---

# Review 1: Payment tables and verified webhook

- Plan: `plan-1-payment-tables-and-webhook.md`
- Spec: `spec.md` (revision 3)
- Reviewer: Claude Code, fresh review session
- Independent from implementation: yes (did not implement in this session)
- Baseline: `18440c2` (HEAD); work is uncommitted and sits on the user's uncommitted folder restructure and unshipped booking plans 1–3
- Diff scope: `database/schema.sql` (payments/payment_events block), `lib/server/payments/webhook.ts`, `lib/server/payments/ledger.ts`, `app/api/webhooks/paymongo/route.ts`, `app/api/paymongo/webhook/route.ts`, `lib/server/data-service.ts` (activateSubscription, execute webhook callback, ledger import), `tests/paymongo-webhook.cjs`, `tests/data/postgres-schema.cjs`, `package.json`

## Round 1 (2026-10-17)

- Scope reviewed: all
- Verdict: pass

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `node --test tests/paymongo-webhook.cjs` | 8/8 pass |
| `npm test` | 133/134; only `tests/data/system-activity.cjs` fails (pre-existing at HEAD, booking review 1) |

### Acceptance

| Criterion | Met? | Evidence |
| --- | --- | --- |
| AC7 | yes | `app/api/paymongo/webhook/route.ts` re-exports `POST`; test 1 |
| AC8 | yes | `webhook.ts` `handleWebhook`: size → 413, `verifyWebhook` before `JSON.parse` → 401; test 1 |
| AC9 | yes | `processEvent` inserts event inside `execute()` transaction; test 2 |
| AC10 | yes | `on conflict do nothing returning` → `{duplicate}`; test 2 |
| AC11 | yes | catch → 503, transaction rolled back; test 4 |
| AC12 | yes | `paid()` exact match on reference, livemode, PHP, centavos; test 2 |
| AC13 | yes | mismatch → `review` with reason; unknown session stored, 200; test 3 |
| AC14 | yes (fixture only) | `failed()`; test 5. Real payload shape unverified (see F1) |
| AC15 | yes | `confirmFromPayment` via `paidTotal` ≥ 30%, actor system; test 2 |
| AC16 | yes | hold_expired/dates_taken → `review`; test 6 |
| AC19 | yes | `activateSubscription` once; duplicate is no-op; test 7 |
| booking AC18/AC19 | yes | test 8 allowlist; already-paid no-op |
| Technical: raw-body verify, no payload/secret in logs | yes | `webhook.ts` logs ids/status only |

### Traceability

| Task | Test/evidence | Result |
| --- | --- | --- |
| T1.1 | `tests/data/postgres-schema.cjs` | met |
| T1.2 | test 1 | met |
| T1.3 | test 1 | met |
| T1.4 | test 2 | met |
| T1.5 | test 2 | met |
| T1.6 | test 4 | met |
| T1.7 | test 2 | met |
| T1.8 | test 3 | met |
| T1.9 | test 5 | met |
| T1.10 | test 2 | met |
| T1.11 | test 6 | met |
| T1.12 | test 7 | met |
| T1.13 | test 8 | met |

### Findings

| # | Severity | Finding | Where | Required fix |
| --- | --- | --- | --- | --- |
| F1 | minor | `payment.failed` matching (`reference_number`/`external_reference_number`/`metadata`) and the paid-event amount path are verified only against the fixture; the plan's manual tunnel check was not run. Paid-path fields mirror the previously proven `settlePayment`, so risk is low; failed-path is unconfirmed. | `lib/server/payments/webhook.ts:88-90` | Before deployment, run the plan's test-mode tunnel check and record a redacted real `payment.failed` and `checkout_session.payment.paid` payload; adjust matching if it differs. |
| F2 | minor | Paid event for a booking that is no longer `awaiting_payment` for reasons other than hold expiry (e.g. client-cancelled, `not_awaiting_payment`) leaves the payment `paid` with no `review` flag, so unexpected money is not surfaced. Spec only requires `review` for AC16 cases. | `lib/server/payments/webhook.ts:74-79` | Consider also sending `not_awaiting_payment` to `review` when the booking is not already `confirmed`; raise as spec follow-up if wanted. |
| F3 | minor | Size limit uses `raw.length` (UTF-16 units) after reading the whole body; a multibyte body slightly over 1 MB in bytes passes. | `lib/server/payments/webhook.ts:12` | Use `Buffer.byteLength(raw)` (and optionally check `content-length` first). |
| F4 | minor | A verified but unparsable/shape-invalid event returns 400 and is not stored. | `lib/server/payments/webhook.ts:17` | Acceptable; optionally log the event type only. |

### Scope check

- Changes outside the plan: extra columns (`owner_email`, `plan`, `method`, `provider_reference`, `review_reason`, `paid_at`, `legacy_id`) and `type 'subscription'` — justified in impl-1 and additive. Import path edits in `data-service.ts` belong to the user's restructure, not this plan.

### Unverified checks

- Manual: PayMongo test-mode webhook via tunnel to `/api/webhooks/paymongo` (F1). Target: local dev. Must be done before deploy.
- Operational: switching the PayMongo dashboard URL (user action, out of scope).
