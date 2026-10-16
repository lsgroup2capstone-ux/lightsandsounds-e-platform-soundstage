---
tags:
  - feature/spec-approved
  - domain/refunds
  - domain/finance
updated: 2026-10-15
---

# Refund module

Links: [[Feature-Index]] · [[Database]] · [[Dependencies]] · [[Decisions]]

- SDD state: spec approved; no plan exists.
- Target tables: `refunds`, `refund_status_history`, and `refund_attachments`.
- Current baseline: refund state is embedded in JSON bookings and has a simpler review flow.
- Target workflow: Client requests/withdraws; Payroll Master approves/rejects, records an external reference to complete, or marks failed/retries.
- Integrity: cap completed refunds to verified paid amount, allocate newest paid payments first, update booking/payment/refund/history/audit in one transaction, and reject deletion.

Original artifacts: [spec](../../features/20261009-refund-module/spec.md)
