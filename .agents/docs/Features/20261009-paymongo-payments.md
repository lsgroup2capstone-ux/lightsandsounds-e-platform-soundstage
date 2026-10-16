---
tags:
  - feature/plan-approved
  - domain/payments
  - database
updated: 2026-10-15
---

# PayMongo payment module

Links: [[Feature-Index]] · [[Database]] · [[Dependencies]] · [[Decisions]]

- SDD state: two plans approved; implementation is sequenced after booking plans 1-3.
- Target tables: `payments` and `payment_events` with verified, deduplicated webhook processing.
- Current baseline: PayMongo checkout/signature verification exists, but settlement updates JSON bookings/subscriptions and stores checkout state in JSON records.
- Target rule: the return page only displays status; paid state is authoritative only after a signature-verified webhook whose stored reference, amount, currency, and mode match.
- Used by Client, Provider, Payroll, Refunds, and Payouts.

Original artifacts: [spec](../../features/20261009-paymongo-payments/spec.md) · [plans](../../features/20261009-paymongo-payments/)
