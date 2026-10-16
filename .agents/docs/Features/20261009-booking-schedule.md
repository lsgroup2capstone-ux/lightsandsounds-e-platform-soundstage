---
tags:
  - feature/plan-approved
  - domain/booking
  - database
updated: 2026-10-15
---

# Shared booking and schedule module

Links: [[Feature-Index]] · [[Database]] · [[Dependencies]] · [[Development-Roadmap]]

- SDD state: five plans approved; plan 1 is next.
- Target tables: `bookings`, `booking_status_history`, `availability_schedules`, `reschedule_requests`, and `cancellation_requests`.
- Target guarantees: immutable snapshots/history, transactional transitions, database overlap prevention, 48-hour payment holds, and verified-payment-only confirmation.
- Current baseline: bookings, schedules, feedback, and refund state are JSON records handled by `lib/server/domain/client-bookings.ts` and `lib/server/data-service.ts`.
- Sequence: plans 1-3 → [[20261009-paymongo-payments]] plans 1-2 → plans 4-5.

Original artifacts: [spec](../../features/20261009-booking-schedule/spec.md) · [design](../../features/20261009-booking-schedule/design.md) · [plans](../../features/20261009-booking-schedule/)
