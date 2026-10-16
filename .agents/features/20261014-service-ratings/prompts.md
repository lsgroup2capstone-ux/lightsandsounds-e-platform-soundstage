# Prompts: Service ratings

## Plan 1: Service ratings

### Implement (after the user approves this plan and provider-browse review passes)

```text
Use the sdd-implement skill in .agents/skills/sdd-implement/SKILL.md for .agents/features/20261014-service-ratings/plan-1-service-ratings.md (spec revision 2). Read AGENTS.md, the spec, and the plan. Confirm the plan is approved and that 20261014-provider-browse review passed, and run the read-only SDD doctor before editing. Implement only this plan; run applicable local checks, record AC evidence in impl-1-service-ratings.md, and stop at ready-for-review. Do not commit.
```

### Review (fresh reviewer, after implementation)

```text
Use the sdd-review skill in .agents/skills/sdd-review/SKILL.md for .agents/features/20261014-service-ratings/plan-1-service-ratings.md (spec revision 2). Independently inspect the spec, plan, implementation report, and real diff; confirm the public ratings record exposes only rating, comment, date and "First L." (AC6). Run applicable local checks; record findings, AC evidence, and unverified items in review-1-service-ratings.md. Give a pass only when its gate is met. Do not edit implementation code or commit.
```

### Ship (only after a pass and explicit user request to commit)

```text
Use the sdd-ship skill in .agents/skills/sdd-ship/SKILL.md for .agents/features/20261014-service-ratings/plan-1-service-ratings.md (spec revision 2). Verify the latest independent review passed and the user authorized this commit. Stage only the plan's reviewed files, scan the staged diff for secrets, commit, and report the hash and remaining status. Do not push, merge, or deploy.
```
