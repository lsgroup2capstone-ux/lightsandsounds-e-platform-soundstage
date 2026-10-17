---
tags:
  - feature/ready-for-review
  - public-marketplace
updated: 2026-10-15
---

# Provider-first browse

Links: [[Feature-Index]] · [[Modules]] · [[Agent-Progress]] · [[Bug-Tracker]]

- SDD state: ready for independent review.
- Implemented in the working tree: `/browse` provider cards, `/providers/[id]`, service category, filters/sort/search, and approved providers with no services. Review round 1 findings F1-F2 were fixed by restoring Category/Price controls and the three approved sorts while retaining rating display.
- Recorded fix-round checks: typecheck passed, provider-browse tests passed 10/10, and service-ratings tests passed 4/4.
- Full suite was recorded 113/114 because the known `tests/data/system-activity.cjs` refund-link assertion still fails.
- Manual responsive, filter, sorting, bad-id, and keyboard walkthrough is not done.
- Dependency: [[20261014-service-ratings]] was specified to follow this feature's review because both touch browse surfaces.

Original artifacts: [spec](../../features/20261014-provider-browse/spec.md) · [plan](../../features/20261014-provider-browse/plan-1-provider-browse.md) · [implementation](../../features/20261014-provider-browse/impl-1-provider-browse.md)
