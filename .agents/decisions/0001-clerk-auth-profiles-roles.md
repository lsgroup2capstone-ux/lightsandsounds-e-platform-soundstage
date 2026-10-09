# 0001: Clerk authenticates; `profiles` owns roles

- Status: proposed
- Date: 2026-10-09
- Feature: .agents/features/20261009-role-based-access/spec.md

## Context

Identity was split between Supabase Auth (`soundstage.identities`, admins) and Clerk (`soundstage.clerk_identities`, clients and providers), and page access was checked only in the browser.

## Decision

- Clerk is the only authentication provider for every role.
- `soundstage.profiles` is the source of truth for a user's role and active state. Clerk `publicMetadata.role` is a mirror for fast checks only.
- Server-side code authorizes from `profiles`; client input never grants `payroll_master` or `admin`.
- Each role is confined to its own route area: `/client`, `/provider`, `/payroll-master`, `/admin`.

## Consequences

- New features check access through the shared permission helpers, not ad hoc role comparisons.
- Privileged roles change only through a server-side path (script now, admin screen later).
- The legacy identity tables are read-only and scheduled for removal.
