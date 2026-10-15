---
tags:
  - feature/approved
  - module/provider
updated: 2026-10-15
---

# Service provider module

Links: [[Feature-Index]] · [[Modules]] · [[Dependencies]] · [[Bug-Tracker]]

- SDD state: plan 1 (unverified-provider lock) passed independent review and shipped; the rest of the module has no plans yet.
- Implemented plan 1: server allowlist and hub lock constrain unapproved providers to application/document/notification actions.
- Manual verification still required: pending/rejected/approved navigation and unlock behavior with provider and Admin accounts.
- Review follow-up: rejected/unapproved providers still receive their own prior snapshot data; no cross-tenant leak was found.
- Remaining target: provider profile, services, coverage, availability, booking requests, read-only payout/feedback, and component split.

Original artifacts: [spec](../../features/20261009-provider-module/spec.md) · [plan 1](../../features/20261009-provider-module/plan-1-unverified-provider-lock.md) · [review 1](../../features/20261009-provider-module/review-1-unverified-provider-lock.md)
