---
artifact: review
schema: 1
feature: 20261009-role-based-access
revision: 1
status: pass
risk: high-risk
---

# Review 2: Access rules, server helpers, and proxy

- Plan: `plan-2-access-rules-and-proxy.md`
- Spec: `spec.md` revision 3
- Reviewer: `/root/review_role_plan2` (fresh reviewer agent)
- Independent from implementation: yes
- Baseline: `00f854c49c530b2c14f48ec57a243d63a0c886b0`
- Diff scope: uncommitted plan-2 changes in `lib/server/access-rules.ts`, `lib/server/access.ts`, `proxy.ts`, `tests/access-rules.cjs`, `tests/access.cjs`, `tests/proxy.cjs`, and `package.json`; untracked files were read directly and the working-tree diff was authoritative. Plan-1 and plan-3 portions interleaved in shared files were excluded from this plan's judgment.
- Expert skills: `supabase` (review of the server-only, parameterized authoritative-profile lookup and database boundary; no hosted operation was run). The skill was discovered by the required folder scan because the generated index is stale.

## Round 1 (2026-10-13)

- Scope reviewed: all of plan 2, including its interaction with the spec's route and role-change decisions
- Verdict: changes-requested

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `node --test tests/access-rules.cjs tests/access.cjs tests/proxy.cjs` | pass: 21 tests, 21 pass, 0 fail |
| `npm.cmd run typecheck` | pass, exit 0 |
| `npm.cmd test` | pass: 85 tests, 85 pass, 0 fail |
| `git -c safe.directory=... diff --check -- <plan-2 paths>` | pass, exit 0; line-ending warnings only |
| scoped secret-pattern scan over plan-2 files | pass: 0 matches (`rg` exit 1 means no matches) |
| lint | not run: the approved plan records lint as unavailable |
| build | not run: plan 2 requires typecheck and tests, not a build |

The installed Clerk 7.9.4 middleware implementation and types were inspected read-only. `clerkMiddleware()` defers key assertions until its returned handler is invoked, so the missing-key branch in `proxy.ts` can return the intended 503 without calling Clerk. The server-only profile lookup is parameterized and does not expose the Supabase service/database boundary to the browser.

### Acceptance

| Criterion | Met? | Evidence |
| --- | --- | --- |
| AC11 | yes | `proxy.ts:10-18`; `signed-out protected requests redirect to login with path and query` |
| AC13 | yes | `lib/server/access-rules.ts:17-30`; `dashboardFor maps every supported role` |
| AC19 | yes | `proxy.ts:5-8,33-37`; `missing Clerk keys fail closed on protected paths and preserve public pages`; installed middleware inspection confirms its key assertion is not executed during wrapper construction |
| AC14 (cross-plan interaction) | no | `proxy.ts:11-18` classifies `/dashboard` as `router` and sends a signed-out request to `/login?returnTo=%2Fdashboard`, while AC14 requires `/login` |
| AC16/D16 (cross-plan interaction) | no | `lib/server/access.ts:95-110` proceeds with refresh after `mirrorRole`, but `lib/server/profiles.ts:45-51` swallows mirror failure; a stale claim can therefore bounce indefinitely between the old and new dashboards |
| AC17 (cross-plan interaction) | no | `lib/server/access.ts:60-66,104-106` catches session-revocation failure and still redirects with a disabled-account status as though sign-out succeeded |

### Traceability

| Task | Test/evidence | Result |
| --- | --- | --- |
| T2.1 | dashboard/path matrix, unsafe-return rejection, and every pure decision branch | met |
| T2.2 | helper success and denial tests plus source inspection | not met: Clerk mirror and revocation failure paths are not safely represented or tested (F2-F3), and profile lookup logs the wrong area token (F4) |
| T2.3 | missing keys, protected signed-out redirect, claim redirect, missing claim, trusted header, and public pass-through | not met: listed happy-path tests pass, but the untested `/dashboard` signed-out branch contradicts AC14 (F1) |

### Findings

| # | Severity | Finding | Where | Required fix |
| --- | --- | --- | --- | --- |
| F1 | major | A signed-out request to `/dashboard` is redirected to `/login?returnTo=%2Fdashboard`. Spec D9/AC14 require exactly `/login`; preserving `/dashboard` also creates an unnecessary post-login router cycle. | `proxy.ts:11-18`; `lib/server/access-rules.ts:42` | Special-case the `router` area in the signed-out proxy branch to redirect to `/login` without `returnTo`, while retaining `returnTo` for the four protected role areas. Add a proxy regression test for signed-out `/dashboard`. |
| F2 | major | The redirect-loop prevention assumes the Clerk role mirror was repaired, but `mirrorRole` catches every Clerk error and returns success-like `undefined`. `requireRole` then renders `AccessRefresh`; the refreshed token can retain the stale claim, so the proxy redirects to the old dashboard and the layouts can repeat the cycle indefinitely. This breaks D16's changed-role redirect and the design's explicit loop-prevention contract. | `lib/server/access.ts:95-110`; `lib/server/profiles.ts:45-51` | Make the access path able to distinguish mirror success from failure (for example, a checked/throwing mirror operation). On failure, remain fail-closed and return a retryable error instead of `refresh`. Add tests for mirror failure both when the requested area matches the database role and when it matches the stale claim. |
| F3 | major | Session revocation errors are swallowed, but `requireRole` still redirects to `/login?status=...` as if the suspended/deactivated user was signed out. The Clerk session remains active, so AC17's sign-out outcome is false even though protected content remains denied. The tests cover only successful revocation. | `lib/server/access.ts:60-66,104-106`; `tests/access.cjs:111-121` | Propagate a revocation failure into a fail-closed, retryable error decision and do not report a successful sign-out. Add a negative test proving the error path renders no protected content and does not claim success. |
| F4 | minor | The approved plan requires profile lookup errors to log `access-denied <area> profile-lookup-failed`, but the implementation logs the literal area `profile`, followed by a separate generic `<area> error` line. This loses the requested area/reason pair used for operational diagnosis. | `lib/server/access.ts:43-53,87-102`; `tests/access.cjs:123-129` | Emit `access-denied <actual-area> profile-lookup-failed` from `requireRole` (or pass the area to the lookup boundary) and update the assertion. Keep IDs and secrets out of the log. |

### Scope check

- Plan-2 changes otherwise stay within the approved shared rules, helper, proxy, test, and package-script files. All three implementation files are below the plan's 300-line technical limit, and `access-rules.ts` has no Node-only or secret-bearing import.
- The working tree also contains approved role-access plans 1 and 3 and unrelated R2 work. Plan-3-only `routeDashboard`/`revokeInactiveSession`, its assertions in `tests/access.cjs`, and unrelated `package.json` test entries were excluded from this verdict.
- No application code, tests, config, spec, plan, or implementation report was changed by this review.

### Unverified manual and operational checks

- Not run: the Clerk dashboard session-token customization. It is a scoped provider operation and was not authorized for this reviewer.
- Not run: browser navigation to `/admin/accounts` while signed out, temporarily removing a Clerk key from a running development server, or multi-account role-change navigation. These remain manual checks.
- No hosted Supabase query, Clerk API mutation, database migration, deployment, or other non-local operation was performed.

### Next step

Run `sdd-implement` for plan 2 as a focused fix round addressing F1-F4, update `impl-2-access-rules-and-proxy.md` with the new evidence, and return this plan to an independent `sdd-review` round 2.

## Round 2 (2026-10-13)

- Scope reviewed: F1-F4 fixes, the shared plan-1 `mirrorRole` result contract, the plan-3 dashboard revocation consumer, and regression impact
- Verdict: pass

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `node --test tests/access-rules.cjs tests/access.cjs tests/proxy.cjs tests/profiles.cjs` | pass: 27 tests, 27 pass, 0 fail |
| `npm.cmd run typecheck` | pass, exit 0 |
| `npm.cmd test` | pass: 88 tests, 88 pass, 0 fail |
| `git -c safe.directory=... diff --check -- <fix and consumer paths>` | pass, exit 0; line-ending warnings only |
| scoped secret-pattern scan over fix and consumer files | pass: 0 matches (`rg` exit 1 means no matches) |
| lint | not run: the approved plan records lint as unavailable |
| build | not run: plan 2 requires typecheck and tests, not a build |

### Acceptance and fix verification

| Item | Met? | Evidence |
| --- | --- | --- |
| F1 / AC14 | yes | `proxy.ts:15-18` sends the `router` area directly to `/login`; `signed-out dashboard requests redirect directly to login` asserts an empty query string |
| F2 / D16 and AC16 safety | yes | `lib/server/profiles.ts:45-53` returns mirror success/failure; both access branches at `lib/server/access.ts:96-102,115-121` return `error` on failure; `requireRole renders an error instead of looping when role mirroring fails` executes both the database-role area and stale-claim area cases |
| F3 / AC17 safety | yes | `lib/server/access.ts:60-68,107-113` returns a fail-closed error when revocation fails; `requireRole stays fail-closed when an inactive session cannot be revoked` proves no successful redirect. The plan-3 dashboard consumer at `app/dashboard/page.tsx:17-20` checks the shared boolean and renders only a retryable alert on failure. |
| F4 / area-specific lookup logging | yes | `lib/server/access.ts:43-53,82` carries the actual area to the lookup boundary; `requireRole denies a profile lookup failure with an error decision` asserts `access-denied client profile-lookup-failed` |
| AC11 | yes | The protected-path signed-out behavior remains covered by `signed-out protected requests redirect to login with path and query` |
| AC13 | yes | The four-role dashboard mapping remains covered by `dashboardFor maps every supported role` |
| AC19 | yes | The missing-key protected/public behavior remains covered by `missing Clerk keys fail closed on protected paths and preserve public pages` |

### Traceability

| Task | Test/evidence | Result |
| --- | --- | --- |
| T2.1 | pure rule matrix and decision tests | met |
| T2.2 | helper success, denial, mirror-failure, revoke-failure, and area-specific lookup-log tests | met |
| T2.3 | proxy missing-key, signed-out role-area, signed-out router, claim, trusted-header, and public-path tests | met |

### Findings

| # | Severity | Finding | Where | Required fix |
| --- | --- | --- | --- | --- |
| F5 | minor | After the fix refactor, normal wrong-role `redirect` and missing-profile `complete` decisions call Next's throwing `redirect()` before reaching the generic `logDecision` at the end of the function. Those two non-allow decisions therefore no longer satisfy the plan's “log every non-allow decision” requirement. Authorization remains fail-closed. | `lib/server/access.ts:105-106,123-124` | Log `redirect` and `complete` before invoking `redirect()`, and add assertions for both decisions. Avoid duplicate logs for the other branches. |

F1-F4 are closed. No blocker or major finding remains; F5 is non-blocking.

### Scope check

- The fixes are limited to the proxy, shared access/profile helpers, their regression tests, the implementation report/status evidence, and the required plan-3 dashboard consumer safety adjustment.
- The `mirrorRole` boolean is a shared plan-1 dependency contract change. The executed profile tests pass 3/3, and the access callers now consume failure without granting access or refreshing a stale token. No unrelated plan-1 behavior was changed for this review scope.
- The plan-3 dashboard consumer does not redirect or render protected content after revocation failure; it renders a retryable alert. Its broader routing behavior remains for the plan-3 reviewer.
- Other unrelated R2 and working-tree changes remain excluded. No application code, tests, config, spec, plan, or implementation report was changed by this review.

### Unverified manual and operational checks

- Not run: Clerk dashboard session-token customization, browser role navigation, temporary runtime key removal, or hosted Supabase/Clerk operations. These remain scoped or manual checks.
- The plan-3 reviewer should independently exercise or test the dashboard page's inactive-session branch as part of that plan's AC17 evidence.

### Next step

Plan 2 is approved. Run `sdd-ship` for plan 2 when the user wants the reviewed slice committed, or continue independent review of plan 3 before shipping the combined role-access work. F5 may be cleaned up in a non-blocking focused fix before shipment.
