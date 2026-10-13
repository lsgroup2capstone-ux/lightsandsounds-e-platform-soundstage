---
artifact: review
schema: 1
feature: 20261009-role-based-access
revision: 1
status: pass
risk: high-risk
---

# Review 3: Section layouts, dashboard router, and sign-in redirects

- Plan: `plan-3-layouts-and-redirects.md`
- Spec: `spec.md` revision 3
- Reviewer: `/root/review_role_plan3` (fresh reviewer agent)
- Independent from implementation: yes
- Baseline: `00f854c49c530b2c14f48ec57a243d63a0c886b0`
- Diff scope: uncommitted plan-3 changes in `app/client/layout.tsx`, `app/provider/layout.tsx`, `app/payroll-master/layout.tsx`, `app/admin/layout.tsx`, `app/payroll-master/page.tsx`, `components/auth/access-refresh.tsx`, `app/dashboard/page.tsx`, `components/auth/login-form.tsx`, `app/auth/clerk/complete/page.tsx`, `app/login/page.tsx`, the plan-3 portions of `lib/server/access.ts`, and the plan-3 portions of `tests/access.cjs`. Untracked files were read directly and the working tree was authoritative; plan-1, plan-2, and unrelated R2 changes were excluded except where a shared plan-2 dependency or fix is explicitly noted.
- Expert skills: `supabase` (reviewed the server-only authoritative-profile lookup and inactive-session boundary; no hosted Supabase or Clerk operation was run). The skill was discovered by the required folder scan because the generated index is stale.

## Round 1 (2026-10-13)

- Scope reviewed: all of plan 3, including the plan-2 revocation-failure fix consumed by `app/dashboard/page.tsx`
- Verdict: pass

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `node --test tests/access-rules.cjs tests/access.cjs tests/proxy.cjs tests/profiles.cjs` | pass: 27 tests, 27 pass, 0 fail |
| `npm.cmd run typecheck` | pass, exit 0 |
| `npm.cmd test` | pass: 88 tests, 88 pass, 0 fail |
| `npm.cmd run build` | pass: Next.js production build compiled and typechecked; `/client`, `/provider`, `/payroll-master`, `/admin`, and `/dashboard` are dynamic routes |
| `git -c safe.directory=... diff --check -- <plan-3 paths>` | pass, exit 0; line-ending warnings only |
| scoped secret-pattern scan over plan-3 files | pass: 0 matches (`rg` exit 1 means no matches) |
| lint | not run: the approved plan records lint as unavailable |

### Acceptance

| Criterion | Met? | Evidence |
| --- | --- | --- |
| AC12 | yes | Each layout calls `requireRole` and returns children only for `allow` at `app/client/layout.tsx:6-10`, `app/provider/layout.tsx:6-10`, `app/payroll-master/layout.tsx:6-10`, and `app/admin/layout.tsx:6-10`; `requireRole redirects wrong roles without rendering the requested area` executes the database-role redirect. |
| AC14 | yes | `lib/server/access.ts:127-141`; `routeDashboard maps every role, preserves client tabs, and validates returnTo`; plan-2 proxy coverage also proves signed-out `/dashboard` redirects directly to `/login`. |
| AC15 | yes | `lib/server/access.ts:135-140` applies `safeReturnTo` then `canAccessPath`; the route-dashboard test covers allowed own/public paths and rejects protocol-relative, backslash, cross-role, and `/dashboard` targets. `components/auth/login-form.tsx:13,19,25-29` and `app/auth/clerk/complete/page.tsx:24-28` preserve the value only for server routing. |
| AC16 | yes | `lib/server/access.ts:88-121` authorizes from the database profile and repairs a stale mirror before returning `refresh`; both same-area and stale-claim-area mismatch paths, including mirror failure, execute in `tests/access.cjs:144-169`. Layouts render `AccessRefresh` rather than children for this decision. |
| AC17 | yes | Layout revocation and both inactive statuses execute in `requireRole revokes an inactive session and redirects with its status`; `app/login/page.tsx:8-13` renders the exact alerts. The dashboard consumer at `app/dashboard/page.tsx:17-20` revokes before redirecting and, as required by the plan-2 fix, returns only a retryable alert if revocation fails. |
| AC18 | yes | Profile lookup failure executes as a fail-closed `error` decision; all layouts render only the retryable alert for non-allow/non-refresh results. Missing profiles go through completion, whose error path is an alert plus return-to-login link at `app/auth/clerk/complete/page.tsx:29-30`. |
| AC20 | yes | `app/payroll-master/page.tsx:5-6` renders the protected `Payroll master` placeholder and coming-tools sentence; the production build includes the dynamic route. |
| AC21 | yes | The four layouts delegate to `requireRole`; shared routing helpers are exported from `lib/server/access.ts:18-19`; `all protected layouts delegate their own role to requireRole` proves the expected role arguments and absence of inline profile/claim comparisons. |

### Traceability

| Task | Test/evidence | Result |
| --- | --- | --- |
| T3.1 | four layout source assertions, stale-claim/mirror-failure tests, profile-error test, typecheck, and build | met |
| T3.2 | payroll placeholder source plus dynamic `/payroll-master` build output | met; browser account check remains manual |
| T3.3 | every-role, signed-out, client-tab, and inactive-profile `routeDashboard` assertions | met |
| T3.4 | allowed and rejected return-target assertions plus login/completion source checks | met |
| T3.5 | suspended/deactivated revocation assertions, revoke-failure denial, dashboard failure branch inspection, and exact login-message source checks | met; hosted status/browser check remains manual |

### Findings

| # | Severity | Finding | Where | Required fix |
| --- | --- | --- | --- | --- |
| F1 | minor | If `getClerkBrowser()` or `session.getToken({ skipCache: true })` rejects, the detached effect has no failure handler. The user remains on “Updating your access…” with an unhandled rejection and no retry control. This does not expose protected content or weaken authorization, so it does not block the pass. | `components/auth/access-refresh.tsx:7-12` | Catch refresh failures, replace the status message with a `role="alert"` retryable error, and add a focused component or equivalent behavior test. |

No blocker or major finding remains. Plan 2's previously recorded F5 minor logging issue is inherited and remains non-blocking; it was not reclassified as plan-3 scope.

### Scope check

- Plan-3 application changes stay within the approved layouts, dashboard router, payroll placeholder, sign-in/completion flow, login messages, shared router helper, and access tests. No dependency was added, and every reviewed file is below the project size limits.
- The dashboard's plan-2 revocation-failure adjustment is correct: `app/dashboard/page.tsx:17-18` does not redirect with a success status or render dashboard content when session revocation fails.
- The working tree also contains approved role-access plans 1-2 and unrelated R2 work, including interleaved changes in shared files. Those changes were excluded except for the explicitly reviewed dependencies above.
- No application code, tests, config, spec, plan, or implementation report was changed by this review.

### Unverified manual and operational checks

- Not run: browser sign-in and cross-role navigation with the six Clerk test accounts, including the payroll-master placeholder and a client attempting `/admin`. The deterministic helper/proxy tests and layout source checks provide executed local authorization evidence, but the end-to-end browser flow remains unverified.
- Not run: the keyboard/screen-reader announcement check for status and retry messages.
- Not run: changing a hosted profile to `suspended` and confirming the next browser page load revokes the session. That would mutate a non-local database and was outside reviewer authorization.
- Not run: Clerk session-token claim configuration or any hosted Supabase/Clerk query, mutation, migration, or deployment.
- Plan 3 must not be deployed alone; per the approved plan, ship/deploy it with plan 4 so Supabase-only users are not locked out.

### Next step

Plan 3 is approved. Run `sdd-ship` for plan 3 when the user wants this reviewed slice committed, or implement and independently review plan 4 before a combined deployment. F1 may be addressed in a focused non-blocking fix before shipment.
