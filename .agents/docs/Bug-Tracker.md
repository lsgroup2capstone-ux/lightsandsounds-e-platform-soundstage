---
tags:
  - project/bugs
updated: 2026-10-15
---

# Bug Tracker

Related notes: [[Agent-Progress]] · [[Development-Roadmap]] · [[Architecture]]

Only verified source/review findings are listed. “Open” does not mean reproduced during this documentation task unless the evidence column says so.

## Active issues

| ID | Severity | Issue | Affected files | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| BUG-001 | Tooling | `npm run lint` cannot run because ESLint and a flat configuration are absent. | `package.json`; missing ESLint config | Apple UI and provider-browse implementation reports | Open; decide whether to add lint tooling in a separate approved change |
| BUG-002 | Test | `tests/data/system-activity.cjs` expects `/admin/refunds#transaction-RF-BK-1`, while current code returns `/admin/activity#activity-refund-BK-1`. | `tests/data/system-activity.cjs`, related activity code | Reproduced 2026-10-15 with `node --test tests/data/system-activity.cjs` (0 passed, 1 failed) | Open; decide whether the test is stale under the approved Admin/Payroll route split or the generated link is wrong |
| BUG-003 | Access UX | A rejected Clerk token refresh can leave the access-refresh screen waiting with an unhandled rejection. | `components/auth/access-refresh.tsx` | Role-access review 3 F1 | Open minor; add retryable error handling and a focused test |
| BUG-004 | Observability | Wrong-role redirect and missing-profile completion paths can bypass the generic non-allow decision log. | `lib/server/auth/access.ts` | Role-access review 2 F5 | Open minor; log before Next.js `redirect()` throws |
| BUG-005 | Data exposure boundary | An unapproved provider can still receive its own previously saved data in a GET snapshot. No cross-tenant leak was found. | `lib/server/data-service.ts` `visibleRecords()` | Provider-lock review F1 | Open design follow-up; decide whether rejection should hide or retain own historical data |
| BUG-006 | Upload UX | Logo/setup/profile saves can occur while an R2 upload is still running, potentially retaining the old value without clear feedback. | `components/hubs/hub-workspace.tsx`, `components/client/client-dashboard.tsx` | R2 review 3 F1 | Open minor; track upload state and disable save/publish |
| BUG-007 | Storage cleanup | Parallel provider-document uploads can leave unreferenced private R2 objects after a partial failure. | `lib/auth/client-auth.ts` | R2 review 3 F2 | Open; plan 4 cleanup must sweep unreferenced private keys |
| BUG-008 | Dependency state | `package-lock.json` includes R2 dependency changes while `pnpm-lock.yaml` was recorded stale; two lockfiles remain. | `package-lock.json`, `pnpm-lock.yaml` | R2 review 1 F3 | Open maintenance decision |
| BUG-009 | Transitional auth copy | Retired admin-login endpoint tells users to use Supabase Auth, while the approved/shared role architecture uses Clerk for every role. | `app/api/auth/admin-login/route.ts` | Source inspection against approved role-access spec | Open stale message; application-code fix is outside this documentation task |
| BUG-010 | UI copy | Service location helper still refers to maps after the map UI was replaced with chips. | `components/hubs/hub-workspace.tsx` | Apple UI review 1 F6 | Open minor copy fix |

## Deployment and validation risks

| ID | Risk | Evidence | Resolution condition |
| --- | --- | --- | --- |
| RISK-001 | R2 plans 2-3 must not deploy before migration/cleanup plan 4. | R2 reviews 2-3 | Plan 4 reviewed; migration order documented; dev bucket validated |
| RISK-002 | Role-access hosted migration and migrated-user login remain user-run checks. | Role-access review 4 and task state | Authorized dry run/execute plus password-reset/login verification |
| RISK-003 | Provider browse and service ratings have no completed browser/accessibility pass. | Their implementation reports | Independent review and manual responsive/keyboard/public-data checks |
| RISK-004 | Working tree contains interleaved changes across several features. | Pre-edit `git status` on 2026-10-15 | Ship by explicit paths only after feature-specific diff review |

## Resolved review findings

- Role-access review majors for source preservation, signed-out dashboard redirect, stale role claim loops, revocation failure, and migration recovery were fixed and re-reviewed.
- R2 strict key matching, download-name sanitization, and shared-image deletion risks were fixed and re-reviewed.
- Apple UI card radius and contrast findings were resolved in review round 2.

Resolved items remain in their immutable review artifacts; this tracker keeps only the high-level history.
