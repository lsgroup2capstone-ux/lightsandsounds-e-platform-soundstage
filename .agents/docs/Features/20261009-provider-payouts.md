---
tags:
  - feature/spec-approved
  - domain/payouts
  - domain/finance
updated: 2026-10-15
---

# Provider payout module

Links: [[Feature-Index]] · [[Database]] · [[Dependencies]] · [[Decisions]]

- SDD state: spec approved; no plan exists.
- Target: provider payouts tied to eligible completed/paid bookings, with fee, deduction, item, status-history, and setting records.
- Current baseline: providers submit JSON withdrawal requests; Payroll Master or Admin can mark them Paid/Rejected through transitional actions.
- Depends on Booking, Payments, Refunds, and Role access.
- Integrity direction: no deletion, adjustments instead of edits to settled records, transactional audit rows, and masked accounts outside detail pages.

Original artifacts: [spec](../../features/20261009-provider-payouts/spec.md)
