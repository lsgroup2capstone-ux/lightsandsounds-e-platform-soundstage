---
tags:
  - feature/spec-approved
  - domain/feedback
updated: 2026-10-15
---

# Feedback module

Links: [[Feature-Index]] · [[Database]] · [[Dependencies]] · [[Modules]]

- SDD state: spec approved; no plan exists.
- Target: immutable `booking_feedback` rows, one per completed booking and owned client, with a unique constraint.
- Current baseline: feedback is embedded inside JSON bookings; [[20261014-service-ratings]] exposes a sanitized derived view of it.
- Migration rule: copy existing feedback, skip duplicates, and leave source JSON unchanged.
- Public privacy rule: first name plus last initial only.

Original artifacts: [spec](../../features/20261009-feedback-module/spec.md)
