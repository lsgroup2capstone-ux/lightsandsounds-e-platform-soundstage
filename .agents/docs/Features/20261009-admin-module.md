---
tags:
  - feature/spec-approved
  - module/admin
updated: 2026-10-15
---

# Admin module

Links: [[Feature-Index]] · [[Modules]] · [[Dependencies]] · [[Database]]

- SDD state: spec approved; no plan exists.
- Target: dedicated Admin pages for provider/listing review, account status, activity/audit, settings, backup/restore, and no financial decisions.
- Implemented baseline: shared Admin hub, provider review, users, activity, analytics/audit presentation, and backup/restore components.
- Not implemented: dedicated `components/admin/` pages, `platform_settings`, unified relational audit, and complete removal of Admin money permissions.
- Depends on: [[20261009-role-based-access]], [[20261009-provider-module]], and the Payroll separation-of-duties boundary in [[20261009-payroll-master]].

Original artifacts: [spec](../../features/20261009-admin-module/spec.md)
