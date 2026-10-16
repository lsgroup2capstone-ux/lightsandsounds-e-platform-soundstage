# Prompts: Provider-first browse

## Plan 1: Provider-first browse, provider page, service category

### Implement (after user approves this plan)

```text
Use the sdd-implement skill in .agents/skills/sdd-implement/SKILL.md for .agents/features/20261014-provider-browse/plan-1-provider-browse.md (spec revision 2). Read AGENTS.md, the spec, the revalidated plan, impl-1-provider-browse.md, and the latest review. Confirm the plan is approved and run the read-only SDD doctor before editing. Implement only the Provider Browse review fixes, preserve the existing Service Ratings display wiring in the shared browse component, run the plan's local checks, add a fix-round section with AC evidence to impl-1-provider-browse.md, and stop at ready-for-review. Do not resume Service Ratings fixes, commit, or perform scoped external operations.
```

### Review (fresh reviewer, after implementation)

```text
Use the sdd-review skill in .agents/skills/sdd-review/SKILL.md for .agents/features/20261014-provider-browse/plan-1-provider-browse.md (spec revision 2). Independently inspect the spec, revalidated plan, implementation report, latest review, and real diff. Verify review findings F1-F3, run both focused suites plus applicable local checks, and record the next round's findings, AC evidence, and unverified manual items in review-1-provider-browse.md. Give a pass only when the gate is met. Do not edit implementation code or commit.
```

### Ship (only after a pass and explicit user request to commit)

```text
Use the sdd-ship skill in .agents/skills/sdd-ship/SKILL.md for .agents/features/20261014-provider-browse/plan-1-provider-browse.md (spec revision 2). Verify the latest independent review passed and the user authorized this commit. Stage only the plan's reviewed files, scan the staged diff for secrets, commit, and report the hash and remaining status. Do not push, merge, deploy, or include unfinished Service Ratings work unless it was explicitly included in the passed review and authorized commit scope.
```
