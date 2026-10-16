# Prompts: Shared booking and schedule module (with PayMongo payments)

Run these in this exact order. It runs across both features, as the user decided on 2026-10-13 (design U1):

1. booking plan 1
2. booking plan 2
3. booking plan 3
4. payments plan 1
5. payments plan 2
6. booking plan 4
7. booking plan 5

Payments prompts live in `.agents/features/20261009-paymongo-payments/prompts.md`. Give each block to a new session at its gate. Nothing is deployed until all seven have shipped.

## Plan 1: Booking schema

### Implement (after user approves this plan)

```text
Use the sdd-implement skill in .agents/skills/sdd-implement/SKILL.md for .agents/features/20261009-booking-schedule/plan-1-booking-schema.md (spec revision 4). Read AGENTS.md, the spec, the plan, and .agents/features/20261009-booking-schedule/design.md. Confirm the plan is approved and run the read-only SDD doctor before editing. Implement only this plan; run applicable local checks, record AC evidence in impl-1-booking-schema.md, and stop at ready-for-review. Do not run db:init against any real database, commit, or perform other scoped external operations.
```

### Review (fresh reviewer, after implementation)

```text
Use the sdd-review skill in .agents/skills/sdd-review/SKILL.md for .agents/features/20261009-booking-schedule/plan-1-booking-schema.md (spec revision 4). Independently inspect the spec, plan, design.md, implementation report, and real diff. Run applicable local checks; record findings, AC evidence, and unverified items in review-1-booking-schema.md. Give a pass only when its gate is met. Do not edit implementation code or commit.
```

### Ship (only after a pass and explicit user request to commit)

```text
Use the sdd-ship skill in .agents/skills/sdd-ship/SKILL.md for .agents/features/20261009-booking-schedule/plan-1-booking-schema.md (spec revision 4). Verify the latest independent review passed and the user authorized this commit. Stage only the plan's reviewed files, scan the staged diff for secrets, commit, and report the hash and remaining status. Do not push, merge, or deploy.
```

## Plan 2: Booking core domain

### Implement (after user approves this plan)

```text
Use the sdd-implement skill in .agents/skills/sdd-implement/SKILL.md for .agents/features/20261009-booking-schedule/plan-2-booking-core.md (spec revision 4). Read AGENTS.md, the spec, the plan, and design.md. Confirm plan 1 is shipped and this plan is approved; run the read-only SDD doctor before editing. Implement only this plan; run applicable local checks, record AC evidence in impl-2-booking-core.md, and stop at ready-for-review. Do not commit or perform scoped external operations.
```

### Review (fresh reviewer, after implementation)

```text
Use the sdd-review skill in .agents/skills/sdd-review/SKILL.md for .agents/features/20261009-booking-schedule/plan-2-booking-core.md (spec revision 4). Independently inspect the spec, plan, design.md, implementation report, and real diff, with attention to ownership denial, race handling, and transaction rollback. Run applicable local checks; record findings in review-2-booking-core.md. Give a pass only when its gate is met. Do not edit implementation code or commit.
```

### Ship (only after a pass and explicit user request to commit)

```text
Use the sdd-ship skill in .agents/skills/sdd-ship/SKILL.md for .agents/features/20261009-booking-schedule/plan-2-booking-core.md (spec revision 4). Verify the latest independent review passed and the user authorized this commit. Stage only the plan's reviewed files, scan for secrets, commit, and report the hash. Do not push, merge, or deploy.
```

## Plan 3: Requests and availability

### Implement (after user approves this plan)

```text
Use the sdd-implement skill in .agents/skills/sdd-implement/SKILL.md for .agents/features/20261009-booking-schedule/plan-3-requests-and-availability.md (spec revision 4). Read AGENTS.md, the spec, the plan, and design.md. Confirm plan 2 is shipped and this plan is approved; run the read-only SDD doctor before editing. Implement only this plan; run applicable local checks, record AC evidence in impl-3-requests-and-availability.md, and stop at ready-for-review. Do not commit or perform scoped external operations.
```

### Review (fresh reviewer, after implementation)

```text
Use the sdd-review skill in .agents/skills/sdd-review/SKILL.md for .agents/features/20261009-booking-schedule/plan-3-requests-and-availability.md (spec revision 4). Independently inspect the spec, plan, design.md, implementation report, and real diff. Run applicable local checks; record findings in review-3-requests-and-availability.md. Give a pass only when its gate is met. Do not edit implementation code or commit.
```

### Ship (only after a pass and explicit user request to commit)

```text
Use the sdd-ship skill in .agents/skills/sdd-ship/SKILL.md for .agents/features/20261009-booking-schedule/plan-3-requests-and-availability.md (spec revision 4). Verify the latest independent review passed and the user authorized this commit. Stage only the plan's reviewed files, scan for secrets, commit, and report the hash. Do not push, merge, or deploy.
```

## Plan 4: Rewire and compatibility (after payments plans 1 and 2 ship)

### Implement (after user approves this plan)

```text
Use the sdd-implement skill in .agents/skills/sdd-implement/SKILL.md for .agents/features/20261009-booking-schedule/plan-4-rewire-and-compatibility.md (spec revision 4). Read AGENTS.md, the spec, the plan, and design.md. Confirm booking plans 2-3 and paymongo-payments plans 1-2 are shipped and this plan is approved; run the read-only SDD doctor and git status before editing, and stop if client-dashboard.tsx or hub-workspace.tsx have changes you did not make. Implement only this plan; run applicable local checks, record AC evidence in impl-4-rewire-and-compatibility.md, and stop at ready-for-review. Do not commit or perform scoped external operations.
```

### Review (fresh reviewer, after implementation)

```text
Use the sdd-review skill in .agents/skills/sdd-review/SKILL.md for .agents/features/20261009-booking-schedule/plan-4-rewire-and-compatibility.md (spec revision 4). Independently inspect the spec, plan, design.md, implementation report, and real diff, with attention to cross-user visibility in visibleRecords and the payroll-master-only refund review. Run applicable local checks; record findings in review-4-rewire-and-compatibility.md. Give a pass only when its gate is met. Do not edit implementation code or commit.
```

### Ship (only after a pass and explicit user request to commit)

```text
Use the sdd-ship skill in .agents/skills/sdd-ship/SKILL.md for .agents/features/20261009-booking-schedule/plan-4-rewire-and-compatibility.md (spec revision 4). Verify the latest independent review passed and the user authorized this commit. Stage only the plan's reviewed files, scan for secrets, commit, and report the hash. Do not push, merge, or deploy.
```

## Plan 5: Data migration

### Implement (after user approves this plan)

```text
Use the sdd-implement skill in .agents/skills/sdd-implement/SKILL.md for .agents/features/20261009-booking-schedule/plan-5-data-migration.md (spec revision 4; also paymongo-payments revision 3 AC20). Read AGENTS.md, the spec, the plan, and design.md (mapping U2). Confirm plan 4 is shipped and this plan is approved; run the read-only SDD doctor before editing. Implement only this plan and test it with PGlite; never run the script against a non-local database. Record AC evidence in impl-5-data-migration.md and stop at ready-for-review. Do not commit.
```

### Review (fresh reviewer, after implementation)

```text
Use the sdd-review skill in .agents/skills/sdd-review/SKILL.md for .agents/features/20261009-booking-schedule/plan-5-data-migration.md (spec revision 4). Independently inspect the spec, plan, design.md, implementation report, and real diff, with attention to idempotency, JSON records left unchanged, and conflict reporting. Run applicable local checks; record findings in review-5-data-migration.md. Give a pass only when its gate is met. Do not edit implementation code, run the migration against a real database, or commit.
```

### Ship (only after a pass and explicit user request to commit)

```text
Use the sdd-ship skill in .agents/skills/sdd-ship/SKILL.md for .agents/features/20261009-booking-schedule/plan-5-data-migration.md (spec revision 4). Verify the latest independent review passed and the user authorized this commit. Stage only the plan's reviewed files, scan for secrets, commit, and report the hash. Do not push, merge, deploy, or run the migration.
```
