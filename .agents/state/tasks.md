# Tasks

One line per active feature. Details live in the feature folder. Move `done`
lines to `archive/YYYY-MM.md` at the start of each month.

| Feature | Status | Current plan | Owner | Updated | Checks |
| --- | --- | --- | --- | --- | --- |
| [20261007-standalone-frontend-copy](../features/20261007-standalone-frontend-copy/) | in-progress (plan 3 of 5) | 3 of 5 | implementer | 2026-10-07 | plans 1-2 typecheck/build pass; SDD doctor has 2 pre-existing mirror failures |
| [20261009-role-based-access](../features/20261009-role-based-access/) | done (4 of 4 shipped) | - | user | 2026-10-13 | full 93/93 and typecheck pass; outstanding: user runs auth:profiles dry run, then --execute, plus migrated-login manual checks |
| [20261009-booking-schedule](../features/20261009-booking-schedule/) | in-progress (plans 1-3 of 5 shipped) | 4 of 5 | implementer | 2026-10-17 | review-3 pass (minors M1-M3 for plan 4); npm test 125/126 (known system-activity), typecheck pass; plan 4 blocked on paymongo-payments plans 1-2 |
| [20261009-paymongo-payments](../features/20261009-paymongo-payments/) | in-progress (plan 1 of 2 shipped); plan 2 blocked (user decision) | 2 of 2 | implementer | 2026-10-17 | review-1 pass (4 minor); npm test 133/134 (known system-activity), typecheck pass; manual test-mode webhook check before deploy |
| [20261009-refund-module](../features/20261009-refund-module/) | spec-approved | - | planner | 2026-10-09 | plan after booking-schedule and payments |
| [20261009-provider-payouts](../features/20261009-provider-payouts/) | spec-approved | - | planner | 2026-10-09 | plan after refund-module |
| [20261009-client-module](../features/20261009-client-module/) | spec-approved (rev 5) | - | planner | 2026-10-09 | - |
| [20261009-provider-module](../features/20261009-provider-module/) | spec-approved (rev 7; plan 1 shipped) | 2 | planner | 2026-10-15 | next: plan D16/AC28-AC32 service actions; plan 1 review passed; manual provider/admin browser verification remains outstanding |
| [20261009-payroll-master](../features/20261009-payroll-master/) | spec-approved (rev 5) | - | planner | 2026-10-14 | next: plan 1 = hub shell (D15-D19, AC29-AC34, Standard lane); confirm owner of uncommitted app/payroll-master catch-all route |
| [20261009-admin-module](../features/20261009-admin-module/) | spec-approved | - | planner | 2026-10-09 | - |
| [20261009-feedback-module](../features/20261009-feedback-module/) | spec-approved | - | planner | 2026-10-09 | build step 11 (ADR 0005) |
| [20261009-notifications](../features/20261009-notifications/) | spec-approved | - | planner | 2026-10-09 | build step 12 (ADR 0005) |
| [20261012-r2-file-storage](../features/20261012-r2-file-storage/) | in-progress (plan 3 of 4 done) | 4 of 4 | implementer | 2026-10-13 | plan 3 shipped after review pass; manual R2 checks still outstanding; do not deploy before plan 4; next /sdd-implement plan-4 |
| [20261014-provider-browse](../features/20261014-provider-browse/) | changes-requested (review round 2) | 1 of 1 | implementer | 2026-10-15 | F1-F3 resolved; F4-F7: stable provider identity/account join, approved-only public reads, AC3 service route; focused tests/typecheck pass; full 113/114 with known system-activity failure |
| [20261014-service-ratings](../features/20261014-service-ratings/) | changes-requested | 1 of 1 | implementer | 2026-10-15 | review 1: reconcile browse filters/sorts after provider-browse fix and add signed-out ratings boundary test; focused tests/typecheck pass |
| [20261014-provider-document-categories](../features/20261014-provider-document-categories/) | spec-approved (rev 2) | - | planner | 2026-10-14 | high-risk lane; adds in-browser OCR review form; two-field form already in working tree |
| [20261013-apple-design-ui](../features/20261013-apple-design-ui/) | in-progress (plans 1-2 of 4 shipped: 243d521, a8d3e9b) | 3 of 4 | implementer | 2026-10-13 | browser check pending; next /sdd-implement plan-3 (login-form.tsx has pre-existing changes) |
| <!-- [20260101-example](../features/20260101-example/) --> | <!-- in-progress --> | <!-- 2 of 3 --> | <!-- implementer --> | <!-- 2026-01-02 --> | <!-- types pass, lint pass, test pass, build pass --> |
