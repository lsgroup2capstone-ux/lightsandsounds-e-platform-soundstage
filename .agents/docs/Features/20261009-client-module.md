---
tags:
  - feature/spec-approved
  - module/client
updated: 2026-10-15
---

# Client module

Links: [[Feature-Index]] · [[Modules]] · [[Dependencies]] · [[Development-Roadmap]]

- SDD state: spec approved revision 5; no plan exists.
- Target: dedicated Client pages for providers, comparison, booking, booking details/history, payments, requests, refunds, and feedback.
- Current baseline: `/client` is a tabbed dashboard; public provider browse/profile pages and ratings are separate later features.
- Depends on: [[20261009-role-based-access]] and [[20261009-booking-schedule]]; money/refund/feedback UI also consumes [[20261009-paymongo-payments]], [[20261009-refund-module]], and [[20261009-feedback-module]].
- Privacy boundary: a client must receive only their own bookings and no provider private documents or payout data.

Original artifacts: [spec](../../features/20261009-client-module/spec.md)
