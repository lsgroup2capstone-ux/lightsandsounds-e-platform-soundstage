# 0002: Bookings live in relational tables

- Status: proposed
- Date: 2026-10-09
- Feature: .agents/features/20261009-booking-schedule/spec.md

## Context

Bookings were JSON arrays in `soundstage.records`, so the database could not prevent double-booking, enforce status transitions, or keep history.

## Decision

- `soundstage.bookings` and its related tables are the only source of booking data.
- All booking writes go through shared server-side domain functions that validate, check ownership and current status, and write the status change and its history row in one transaction.
- Overlapping `confirmed`/`in_progress` bookings for one provider are prevented by a database constraint.
- A booking becomes `confirmed` only from a verified payment.
- Booking snapshots (package name, inclusions, price) never change after creation.

## Consequences

- New features read and write bookings only through the shared booking module.
- `booking_status_history` is append-only.
- The JSON booking records are read-only after migration and will be removed later.
