---
tags:
  - feature/done
  - architecture/auth
updated: 2026-10-15
---

# Shared authentication and role-based access

Links: [[Feature-Index]] · [[Architecture]] · [[Database]] · [[Decisions]]

- SDD state: done, four of four plans shipped.
- Implemented: `profiles`, four roles/statuses, Clerk claim pre-check, authoritative server layouts, dashboard routing, fail-closed missing configuration, role assignment script, and Supabase-user migration tooling.
- Reviews: all four plan reviews passed after fixes.
- Recorded validation: full 93/93 tests and typecheck passed at completion.
- Still outstanding: user-run hosted migration dry run/execute, migrated-user password reset/login, broader browser role navigation, and some minor review follow-ups in [[Bug-Tracker]].

Original artifacts: [spec](../../features/20261009-role-based-access/spec.md) · [design](../../features/20261009-role-based-access/design.md) · [plans/reviews](../../features/20261009-role-based-access/)
