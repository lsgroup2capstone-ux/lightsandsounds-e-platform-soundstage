---
artifact: review
schema: 1
feature: 20261009-provider-module
revision: 1
status: pass
risk: high-risk
---

# Review 1: Unverified provider lock

- Plan: `plan-1-unverified-provider-lock.md`
- Spec: `spec.md` (revision 6)
- Reviewer: Claude Code reviewer session (/sdd-review), 2026-10-13
- Independent from implementation: yes (this session did not implement the plan)
- Baseline: HEAD `30b1e0e` plus uncommitted working tree; no separate pre-plan baseline commit exists
- Diff scope: working tree, plan hunks only: `lib/server/provider-lock.ts` (new), `lib/server/data-service.ts` (import + 1 line in `execute`), `lib/hub-data.ts` (+3), `components/hubs/hub-workspace.tsx` (import, `ProviderContent` condition, lock/redirect/banner), `tests/provider-lock.cjs` (new), `package.json` (`test` script). Other modified files in `git status` belong to other work and were not reviewed.

## Round 1 (2026-10-13)

- Scope reviewed: all
- Verdict: pass

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass (`tsc --noEmit`, no output) |
| `npm run lint` | not run: pre-existing, no ESLint config in the repo (per impl report; unrelated to this change) |
| `npm test` | pass, 98/98, 0 fail (includes `tests/provider-lock.cjs`) |
| build | not run (not in plan's routine checks) |

### Acceptance

| Criterion | Met? | Evidence |
| --- | --- | --- |
| AC2 server rejection | yes | `lib/server/provider-lock.ts:7-11`; called in `execute` at `lib/server/data-service.ts:437`, after identity/account resolve and before `actions[action]` (438); throwing inside `sql.begin` rolls back. Tests: "unapproved provider is rejected on locked actions", "unapproved provider can submit the application", "execute runs the gate…" |
| AC2 locked paths | yes | `lib/hub-data.ts:49-50`; test "only the application tab and log out stay unlocked" |
| AC2 sidebar lock icon, redirect, notice | yes by code review; manual check not done | `components/hubs/hub-workspace.tsx:357-359` (lock/redirect), `:367` (span `aria-disabled` + `Lock`, banner with rejection reason) |
| AC2a unlock on next load | yes by code review; manual check not done | Server re-reads approval per request (`isProviderApproved`, `lib/server/domain/client-auth.ts:24`); client derives from `getAccount()` on mount (`hub-workspace.tsx:357`) |

### Traceability

| Task | Test/evidence | Result |
| --- | --- | --- |
| T1.1 | `tests/provider-lock.cjs` tests 1-4 | met |
| T1.2 | `tests/provider-lock.cjs` test 5 | met |
| T1.3 | code review of `hub-workspace.tsx` | met (manual browser check outstanding) |
| T1.4 | manual approve-and-reload | not verified |

### Findings

| # | Severity | Finding | Where | Required fix |
| --- | --- | --- | --- | --- |
| F1 | minor | GET snapshot (`visibleRecords()`) still returns an unapproved provider's own past data (e.g. a provider moved back to Rejected). Own data only, so no cross-tenant leak; plan stop point 1 was correctly reported, not widened. | `lib/server/data-service.ts` `visibleRecords` | Record as a follow-up decision for the user; no change in this plan. |
| F2 | minor | Gate deviation: allowlist lives in a new `lib/server/provider-lock.ts` instead of inline. Behavior equivalent, better testable. | `lib/server/provider-lock.ts` | None; accepted. |
| F3 | minor | `execute` source-order test is a string search; a refactor of that line will break it. | `tests/provider-lock.cjs:36-41` | Optional: replace with an integration test when a DB test harness exists. |
| F4 | minor | `hub-workspace.tsx` is 370 lines (> 300 aim, < 500 limit) with very long single-line JSX; plan 1 adds to it. | `components/hubs/hub-workspace.tsx:367` | None now; later provider-module plans move provider UI to `components/provider/` (D3). |

### Unverified manual checks (must be done before or at ship)

Plan Verification steps 1-4 with `npm run dev` (Clerk sign-in, admin account): locked sidebar, URL redirect with banner, Pending still locked, Rejected shows reason, Approve + reload unlocks (AC2a). Target: local dev only.

### Scope check

- Changes outside the plan: `ProviderContent` no longer exempts Settings for unapproved providers (`hub-workspace.tsx:268`). Justified by D14/AC2 and reported in the impl deviations; accepted.
- When shipping, commit only the six plan paths above; `hub-workspace.tsx`, `data-service.ts`, `hub-data.ts` and `package.json` contain only this plan's hunks per `git diff`, but other modified files in the tree are unrelated.
