---
tags:
  - feature/ready-for-review
  - domain/ratings
updated: 2026-10-15
---

# Service ratings

Links: [[Feature-Index]] · [[Modules]] · [[Agent-Progress]] · [[Database]]

- SDD state: ready for independent review.
- Implemented in the working tree: sanitized per-service ratings record, provider aggregate ratings, service-card summaries, and review lists on both service-detail routes.
- Current source: completed JSON booking feedback; target source later becomes [[20261009-feedback-module|`booking_feedback`]].
- Privacy: reviewer display is first name plus last initial; raw bookings are not published to anonymous visitors.
- Recorded checks: typecheck passed; full suite 107/108 with the reported pre-existing system-activity failure.
- Not verified: browser UI, dark mode, screen reader behavior, and signed-out end-to-end delivery.

Original artifacts: [spec](../../features/20261014-service-ratings/spec.md) · [plan](../../features/20261014-service-ratings/plan-1-service-ratings.md) · [implementation](../../features/20261014-service-ratings/impl-1-service-ratings.md)
