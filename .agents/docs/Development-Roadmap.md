---
tags:
  - project/roadmap
updated: 2026-10-15
---

# Development Roadmap

Related notes: [[Agent-Progress]] · [[Dependencies]] · [[Bug-Tracker]] · [[Decisions]]

This roadmap combines the current task index with the proposed build-order ADR. Each checkbox represents remaining work, not a claim that its prerequisites are already met.

## Priority 0 — close active gates

- [ ] Independently review [[Features/20261014-provider-browse]] and resolve any findings.
- [ ] Independently review [[Features/20261014-service-ratings]] after confirming the shared browse dependency.
- [ ] Reproduce and resolve or formally baseline the `tests/system-activity.cjs` failure in [[Bug-Tracker]].
- [ ] Run the pending browser checks for provider browse, service ratings, role navigation, and shipped Apple UI slices.
- [ ] Ship [[Features/20261009-provider-module|Provider lock plan 1]] only after explicit user authorization and the required manual provider/admin checks.
- [ ] Implement/review/ship [[Features/20261012-r2-file-storage|R2 plan 4]], including legacy base64 migration, orphan cleanup, and deployment notes.

## Priority 1 — establish relational booking and payment foundations

- [ ] Implement and independently review booking plan 1: relational schema and guards.
- [ ] Implement and independently review booking plan 2: booking core domain.
- [ ] Implement and independently review booking plan 3: requests and availability.
- [ ] Implement and independently review payment plan 1: payment tables and verified/deduplicated webhook.
- [ ] Implement and independently review payment plan 2: server-computed checkout and status-only return page.
- [ ] Implement and independently review booking plan 4: rewire existing screens/actions.
- [ ] Implement and independently review booking plan 5: migrate JSON bookings, schedules, and payments.

Do not report these tables as implemented until `database/schema.sql` or approved migration artifacts, code, tests, and independent review show that state. See [[Database]].

## Priority 2 — complete role surfaces

- [ ] Finish [[Features/20261013-apple-design-ui|Apple UI plans 3-4]] for authentication and role workspaces.
- [ ] Resume [[Features/20261007-standalone-frontend-copy|Standalone frontend plans 3-5]] after verifying the missing/relocated standalone folder.
- [ ] Plan and implement remaining [[Features/20261009-client-module|Client module]] slices against the relational booking/payment APIs.
- [ ] Plan and implement remaining [[Features/20261009-provider-module|Provider module]] slices for profiles, services, schedules, booking actions, payouts, and feedback.
- [ ] Plan and implement [[Features/20261009-payroll-master|Payroll Master]] beyond its hub shell.
- [ ] Plan and implement [[Features/20261009-admin-module|Admin]] and remove transitional Admin money permissions.
- [ ] Plan [[Features/20261014-provider-document-categories|document categories/OCR]] before adding its new dependency or stored shape.

## Priority 3 — financial integrity modules

- [ ] Plan, implement, and review [[Features/20261009-refund-module]].
- [ ] Plan, implement, and review [[Features/20261009-provider-payouts]].
- [ ] Add the append-only relational `audit_log` and transactionally couple money/admin decisions.
- [ ] Add database delete/update guards and negative/concurrency tests required by the specs.
- [ ] Verify CSV masking and formula-injection protection for Payroll reports.

## Priority 4 — feedback, notifications, and operational readiness

- [ ] Plan, implement, and review [[Features/20261009-feedback-module]]; migrate embedded feedback without deleting source JSON.
- [ ] Plan, implement, and review [[Features/20261009-notifications]] with in-app records and an email outbox.
- [ ] Complete live-provider validation for Clerk, Supabase, R2, PayMongo, Gmail, and PhilSMS in explicitly authorized non-production targets.
- [ ] Fill in `.agents/rules/project.md` with the real product, stack, verified commands, conventions, and known failures.
- [ ] Choose one package-manager lockfile policy and resolve the current dual-lockfile drift.

## Definition of done for a feature

- [ ] Approved spec decisions and acceptance criteria are current.
- [ ] An approved plan exists for the implemented slice.
- [ ] Implementation report records actual commands and failures.
- [ ] An independent reviewer passes the real diff.
- [ ] Required manual/hosted checks are either completed or explicitly retained as outstanding.
- [ ] `.agents/state/tasks.md`, [[Agent-Progress]], and affected vault notes agree.
- [ ] Commit/ship occurs only when the user explicitly requests it.
