---
artifact: review
schema: 1
feature: 20261014-service-ratings
revision: 1
status: changes-requested
risk: standard
---

# Review 1: Service ratings

- Plan: `plan-1-service-ratings.md`
- Spec: `spec.md` revision 2
- Reviewer: Codex session, 2026-10-15
- Independent from implementation: yes
- Baseline: `bcbd0dd2bf18c9ea2601cbd67225de7409e85583`
- Diff scope: current working-tree changes listed in `impl-1-service-ratings.md`, including shared Provider Browse files; new rating files and tests were included.

## Round 1 (2026-10-15)

- Scope reviewed: all
- Verdict: changes-requested

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `npm run typecheck` | Did not start: PowerShell blocked `npm.ps1`; rerun as `npm.cmd run typecheck`. |
| `npm.cmd run typecheck` | Pass. |
| `node --test tests/service-ratings.cjs` | Pass, 4/4. |
| `npm.cmd test` | 108/109 pass; unrelated `tests/system-activity.cjs:19` failure matches the pre-existing failure recorded by both implementation reports. |
| `npm.cmd run lint` | Not runnable: `eslint` is not installed/resolvable from the script. |

### Acceptance

| Criterion | Met? | Evidence |
| --- | --- | --- |
| AC1 | yes | `lib/service-ratings.ts:16-35`; focused average/count tests pass. |
| AC2 | yes | `components/browse/provider-profile.tsx:114`; `components/site/package-card.tsx:54`. Manual browser evidence remains unverified. |
| AC3 | yes | `components/site/package-card.tsx:54`; `components/site/service-reviews.tsx:22`; `components/browse/provider-card.tsx:28`. |
| AC3a | yes | `components/browse/services-browser.tsx:33,78`; provider-summary focused test passes. |
| AC4 | yes | `components/site/service-reviews.tsx:18-35`; rendered from `app/services/[id]/page.tsx` and `components/site/provider-service-detail.tsx`. Manual browser evidence remains unverified. |
| AC5 | yes | Existing `components/site/star-rating.tsx` exposes a text label and is used by cards/review rows. Manual screen-reader evidence remains unverified. |
| AC6 | partly | Pure sanitization test passes and `lib/server/data-service.ts:346-354` publishes only the derived record, but the required signed-out snapshot check proving no booking keys are returned was not implemented or run. |

### Traceability

| Task | Test/evidence | Result |
| --- | --- | --- |
| T1.1 | `tests/service-ratings.cjs` averages, counts, ordering | met |
| T1.2 | field whitelist and reviewer-name test | met |
| T1.3 | signed-out public snapshot boundary | not met: no integration test or executed manual evidence |
| T2.1 | existing accessible star component | met by code; manual screen-reader check pending |
| T2.2 | provider profile service cards | met by code; manual pending |
| T2.3 | provider-card summary | met by code and pure test; manual pending |
| T2.4 | both detail-page review lists | met by code; manual pending |

### Findings

| # | Severity | Finding | Where | Required fix |
| --- | --- | --- | --- | --- |
| F1 | major | The Service Ratings edit replaced Provider Browse's approved Category/Price filters and Recommended/price sorts with rating-only sorting. This is outside the ratings plan and breaks Provider Browse AC5, AC6, AC8, and part of AC12. | `components/browse/services-browser.tsx:12-72`; see `../20261014-provider-browse/review-1-provider-browse.md` F1-F2 | Reconcile the shared file by restoring Provider Browse's filters and three approved sorts while retaining rating loading and provider rating display. Do not add rating sorting unless the Provider Browse spec is revised. |
| F2 | major | D5 requires Provider Browse to pass review first. It now has a changes-requested verdict, so this implementation cannot be approved on the current shared-file base. | `spec.md:31,49`; `impl-1-service-ratings.md:9-14`; `../20261014-provider-browse/review-1-provider-browse.md` | Complete the Provider Browse fix round first, then rebase/reconcile the ratings diff and rerun both focused suites plus typecheck. |
| F3 | major | The public ratings record crosses the anonymous data boundary, but the planned signed-out verification is absent. The pure field-whitelist test does not prove that raw booking record keys remain excluded from the anonymous snapshot. | `plan-1-service-ratings.md:66`; `lib/server/data-service.ts:346-366`; `impl-1-service-ratings.md:50-51` | Add a server-boundary test that obtains a signed-out `visibleRecords` result and asserts the sanitized ratings key is present while all booking keys and private booking fields are absent. |

### Scope check

- `components/browse/services-browser.tsx` contains out-of-plan filter/sort replacement covered by F1.
- The implementation intentionally started before its D5 dependency passed; the user choice is documented, but the spec was not revised and the dependency is still unsatisfied.
- Manual UI, dark-mode, keyboard, and screen-reader checks remain unverified.
- Expert skill applied: `supabase` for the public/private record boundary. No database schema, RLS, or external operation was changed or executed.
