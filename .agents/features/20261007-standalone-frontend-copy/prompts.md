# Prompts: Standalone frontend copy

Use each block in a fresh session at the stated gate.

## Plan 1: Project foundation and frontend contracts

### Implement (after user approves this plan)

```text
Use the sdd-implement skill in .agents/skills/sdd-implement/SKILL.md for .agents/features/20261007-standalone-frontend-copy/plan-1-project-foundation.md (spec revision 1). Read AGENTS.md, the spec, plan, and linked design. Confirm the plan is approved and run the read-only SDD doctor before editing. Implement only plan 1 inside frontend-copy/, apply its listed expert skills, run applicable local checks, record AC evidence in impl-1-project-foundation.md, and stop at ready-for-review. Do not commit, deploy, or perform external operations without authorization.
```

### Review (fresh reviewer, after implementation)

```text
Use the sdd-review skill in .agents/skills/sdd-review/SKILL.md for .agents/features/20261007-standalone-frontend-copy/plan-1-project-foundation.md (spec revision 1). Independently inspect the spec, design, plan, implementation report, and real diff. Run applicable local checks; record findings, AC evidence, and unverified items in review-1-project-foundation.md. Pass only when the review gate is met. Do not edit implementation code or commit.
```

### Ship (only after a pass and explicit user request to commit)

```text
Use the sdd-ship skill in .agents/skills/sdd-ship/SKILL.md for .agents/features/20261007-standalone-frontend-copy/plan-1-project-foundation.md (spec revision 1). Verify the latest independent review passed and the user explicitly authorized this commit. Stage only reviewed plan files, scan the staged diff for secrets, commit, and report the hash and remaining status. Do not push, merge, or deploy unless separately requested.
```

## Plan 2: Password-recovery frontend

### Implement (after user approves this plan)

```text
Use the sdd-implement skill in .agents/skills/sdd-implement/SKILL.md for .agents/features/20261007-standalone-frontend-copy/plan-2-password-recovery.md (spec revision 1). Read AGENTS.md, the spec, plan, and linked design. Confirm this plan and its dependency are approved, then run the read-only SDD doctor. Implement only plan 2 inside frontend-copy/, apply its listed expert skills, run applicable local checks, record AC evidence in impl-2-password-recovery.md, and stop at ready-for-review. Do not commit, deploy, or call real authentication services.
```

### Review (fresh reviewer, after implementation)

```text
Use the sdd-review skill in .agents/skills/sdd-review/SKILL.md for .agents/features/20261007-standalone-frontend-copy/plan-2-password-recovery.md (spec revision 1). Independently inspect the spec, design, plan, implementation report, and real diff. Run applicable local checks and the planned manual reset-form checks; record findings and AC evidence in review-2-password-recovery.md. Pass only when the review gate is met. Do not edit implementation code or commit.
```

### Ship (only after a pass and explicit user request to commit)

```text
Use the sdd-ship skill in .agents/skills/sdd-ship/SKILL.md for .agents/features/20261007-standalone-frontend-copy/plan-2-password-recovery.md (spec revision 1). Verify the latest independent review passed and the user explicitly authorized this commit. Stage only reviewed plan files, scan the staged diff for secrets, commit, and report the hash and remaining status. Do not push, merge, or deploy unless separately requested.
```

## Plan 3: Dashboard shell and core panels

### Implement (after user approves this plan)

```text
Use the sdd-implement skill in .agents/skills/sdd-implement/SKILL.md for .agents/features/20261007-standalone-frontend-copy/plan-3-dashboard-shell.md (spec revision 1). Read AGENTS.md, the spec, plan, and linked design. Confirm this plan and its dependency are approved, then run the read-only SDD doctor. Implement only plan 3 inside frontend-copy/, apply its listed expert skills, run applicable local checks, record AC evidence in impl-3-dashboard-shell.md, and stop at ready-for-review. Do not commit, deploy, or add backend behavior.
```

### Review (fresh reviewer, after implementation)

```text
Use the sdd-review skill in .agents/skills/sdd-review/SKILL.md for .agents/features/20261007-standalone-frontend-copy/plan-3-dashboard-shell.md (spec revision 1). Independently inspect the spec, design, plan, implementation report, and real diff. Run applicable local checks and planned responsive and keyboard checks; record findings and AC evidence in review-3-dashboard-shell.md. Pass only when the review gate is met. Do not edit implementation code or commit.
```

### Ship (only after a pass and explicit user request to commit)

```text
Use the sdd-ship skill in .agents/skills/sdd-ship/SKILL.md for .agents/features/20261007-standalone-frontend-copy/plan-3-dashboard-shell.md (spec revision 1). Verify the latest independent review passed and the user explicitly authorized this commit. Stage only reviewed plan files, scan the staged diff for secrets, commit, and report the hash and remaining status. Do not push, merge, or deploy unless separately requested.
```

## Plan 4: Complete dashboard panels

### Implement (after user approves this plan)

```text
Use the sdd-implement skill in .agents/skills/sdd-implement/SKILL.md for .agents/features/20261007-standalone-frontend-copy/plan-4-dashboard-panels.md (spec revision 1). Read AGENTS.md, the spec, plan, and linked design. Confirm this plan and its dependency are approved, then run the read-only SDD doctor. Implement only plan 4 inside frontend-copy/, apply its listed expert skills, run applicable local checks, record AC evidence in impl-4-dashboard-panels.md, and stop at ready-for-review. Do not commit, deploy, or add backend behavior.
```

### Review (fresh reviewer, after implementation)

```text
Use the sdd-review skill in .agents/skills/sdd-review/SKILL.md for .agents/features/20261007-standalone-frontend-copy/plan-4-dashboard-panels.md (spec revision 1). Independently inspect the spec, design, plan, implementation report, and real diff. Run applicable local checks and open every planned dashboard panel; record findings and AC evidence in review-4-dashboard-panels.md. Pass only when the review gate is met. Do not edit implementation code or commit.
```

### Ship (only after a pass and explicit user request to commit)

```text
Use the sdd-ship skill in .agents/skills/sdd-ship/SKILL.md for .agents/features/20261007-standalone-frontend-copy/plan-4-dashboard-panels.md (spec revision 1). Verify the latest independent review passed and the user explicitly authorized this commit. Stage only reviewed plan files, scan the staged diff for secrets, commit, and report the hash and remaining status. Do not push, merge, or deploy unless separately requested.
```

## Plan 5: Dashboard interactions and final verification

### Implement (after user approves this plan)

```text
Use the sdd-implement skill in .agents/skills/sdd-implement/SKILL.md for .agents/features/20261007-standalone-frontend-copy/plan-5-dashboard-interactions.md (spec revision 1). Read AGENTS.md, the spec, plan, and linked design. Confirm this plan and its dependency are approved, then run the read-only SDD doctor. Implement only plan 5 inside frontend-copy/, apply its listed expert skills, run every planned local and manual check, record AC evidence in impl-5-dashboard-interactions.md, and stop at ready-for-review. Do not commit, deploy, or connect production services.
```

### Review (fresh reviewer, after implementation)

```text
Use the sdd-review skill in .agents/skills/sdd-review/SKILL.md for .agents/features/20261007-standalone-frontend-copy/plan-5-dashboard-interactions.md (spec revision 1). Independently inspect the spec, design, plan, implementation report, and real diff. Run applicable local checks and the complete interaction, isolation, secret, responsive, and keyboard checks; record findings and AC evidence in review-5-dashboard-interactions.md. Pass only when the review gate is met. Do not edit implementation code or commit.
```

### Ship (only after a pass and explicit user request to commit)

```text
Use the sdd-ship skill in .agents/skills/sdd-ship/SKILL.md for .agents/features/20261007-standalone-frontend-copy/plan-5-dashboard-interactions.md (spec revision 1). Verify the latest independent review passed and the user explicitly authorized this commit. Stage only reviewed plan files, scan the staged diff for secrets, commit, and report the hash and remaining status. Do not push, merge, or deploy unless separately requested.
```
