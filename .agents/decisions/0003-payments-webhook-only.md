# 0003: Payments become paid only through a verified webhook

- Status: proposed
- Date: 2026-10-09
- Feature: .agents/features/20261009-paymongo-payments/spec.md

## Context

The return page could mark payments paid by querying PayMongo directly, and webhook events were not deduplicated by event ID.

## Decision

- A payment becomes `paid` only from a signature-verified PayMongo webhook whose amount, currency, mode, and reference match the stored record exactly.
- Every webhook event ID is stored once; duplicates are acknowledged and ignored.
- Payment amounts are always computed on the server.
- PayMongo secrets are read only from environment variables in server-only code.

## Consequences

- Return pages and clients only display payment status.
- Local development needs PayMongo test webhooks reaching the machine.
- Mismatched or late payments go to `review` for a human decision.
