---
tags:
  - feature/spec-approved
  - domain/notifications
updated: 2026-10-15
---

# Notifications module

Links: [[Feature-Index]] · [[Database]] · [[Dependencies]] · [[Architecture]]

- SDD state: spec approved; no plan exists.
- Target: relational in-app notifications plus an email-delivery outbox with retries.
- Current baseline: the client bell derives limited events from bookings, while read identifiers are stored in JSON records; Gmail and PhilSMS integrations currently serve authentication hooks.
- Target behavior: event and notification insert share a transaction; email failure never rolls back the source event; users cannot delete notifications.
- Depends on every event-producing domain module, so it is late in the build order.

Original artifacts: [spec](../../features/20261009-notifications/spec.md)
