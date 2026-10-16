---
tags:
  - feature/spec-approved
  - module/payroll-master
  - domain/finance
updated: 2026-10-15
---

# Payroll Master module

Links: [[Feature-Index]] · [[Modules]] · [[Database]] · [[Decisions]]

- SDD state: spec approved revision 6; no plan file exists. `.agents/state/tasks.md` still labels revision 5, so the spec is the newer artifact.
- Working-tree baseline: protected `/payroll-master/*` catch-all route and dedicated shared-hub section/navigation.
- Current functional access: reads all bookings/reports and can use transitional JSON review actions.
- Target: payment/history views, two-step refunds, booking-linked payouts, manual subscription review, reports/CSV, disputes, and append-only `audit_log`.
- Depends on [[20261009-role-based-access]], [[20261009-booking-schedule]], [[20261009-paymongo-payments]], [[20261009-refund-module]], and [[20261009-provider-payouts]].
- Separation of duties: Payroll Master owns money decisions; Admin target pages do not.

Original artifacts: [spec](../../features/20261009-payroll-master/spec.md)
