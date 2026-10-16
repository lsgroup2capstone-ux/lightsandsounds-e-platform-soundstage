---
tags:
  - feature/in-progress
  - architecture/storage
updated: 2026-10-15
---

# R2 file storage

Links: [[Feature-Index]] · [[Architecture]] · [[Modules]] · [[Bug-Tracker]]

- SDD state: in progress, plan 4 of 4 next.
- Reviewed/shipped slices: signed URL/key infrastructure, save-path validation and replacement deletion, browser uploads and display.
- Private data: provider documents use short-lived signed GET URLs for Admin/owner only.
- Public data: profile, logo, and service images use the configured public base URL.
- Remaining plan 4: migrate legacy base64, clean orphaned objects/account removals, remove compatibility paths, and document bucket/backup operations.
- Do not deploy plans 2-3 independently before plan 4 migration/cleanup; real dev-bucket/CORS checks remain.

Original artifacts: [spec](../../features/20261012-r2-file-storage/spec.md) · [design](../../features/20261012-r2-file-storage/design.md) · [plans/reviews](../../features/20261012-r2-file-storage/)
