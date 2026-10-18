# Decisions

Project-wide decisions (ADRs) that outlive a single feature. Template:
`.agents/templates/decision.md`. Number them in order: `0001-<slug>.md`.

Agents read this index before writing a spec or plan and must not contradict an
accepted decision without the user's approval.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-clerk-auth-profiles-roles.md) | Clerk authenticates every role; `profiles` owns roles | proposed |
| [0002](0002-bookings-relational-source.md) | Bookings live in relational tables; confirmed only after verified payment | proposed |
| [0003](0003-payments-webhook-only.md) | Payments become paid only through a verified, deduplicated webhook | proposed |
| [0004](0004-financial-records-and-audit.md) | Financial records never deleted; payroll master decides money; append-only audit | proposed |
| [0005](0005-build-order.md) | Twelve-step build order; role specs split into matching plans | proposed |
| [0006](0006-all-data-relational.md) | The database is the 11 core tables of the data dictionary | accepted |
