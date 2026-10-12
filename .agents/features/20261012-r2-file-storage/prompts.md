# Prompts: R2 file storage

Give each block to a new session or agent at its gate, in plan order.
Feature folder: `.agents/features/20261012-r2-file-storage/`. Spec revision 1.
The design (`design.md`) adds the user's planning answers P1 and P2. If the
spec has moved to rev 2, use that revision number instead.

## Plan 1: R2 client, key rules and upload/read URL actions

### Implement (after user approves this plan)

```text
Use the sdd-implement skill in .agents/skills/sdd-implement/SKILL.md for .agents/features/20261012-r2-file-storage/plan-1-r2-core-and-url-actions.md (spec revision 1). Read AGENTS.md, the spec, the plan, and design.md. Confirm the plan is approved and run the read-only SDD doctor before editing. Check git status for lib/server/data-service.ts; stop if it has changes you did not make. Implement only this plan; run npm run typecheck and npm test, record AC evidence in impl-1-r2-core-and-url-actions.md, and stop at ready-for-review. Make no real R2 calls. Do not commit.
```

### Review (fresh reviewer, after implementation)

```text
Use the sdd-review skill in .agents/skills/sdd-review/SKILL.md for .agents/features/20261012-r2-file-storage/plan-1-r2-core-and-url-actions.md (spec revision 1). Independently inspect the spec, design.md, plan, implementation report, and real diff. Focus on the authorization order in both actions, key regex strictness, presign expiry and signed headers, server-only credentials, and after-commit delete behavior. Run npm run typecheck and npm test; record findings in review-1-r2-core-and-url-actions.md. Do not edit code or commit.
```

### Ship (only after a pass and explicit user request to commit)

```text
Use the sdd-ship skill in .agents/skills/sdd-ship/SKILL.md for .agents/features/20261012-r2-file-storage/plan-1-r2-core-and-url-actions.md (spec revision 1). Verify the latest review passed and the user authorized this commit. Stage only the plan's reviewed files, scan the staged diff for secrets (no .env.local), commit, and report the hash. Do not push.
```

## Plan 2: Save-path key validation and replacement deletes

### Implement (after user approves this plan)

```text
Use the sdd-implement skill in .agents/skills/sdd-implement/SKILL.md for .agents/features/20261012-r2-file-storage/plan-2-save-validation-and-deletes.md (spec revision 1). Read AGENTS.md, the spec, the plan, and design.md; confirm plan 1 is shipped and run the read-only SDD doctor. Implement only this plan; run npm run typecheck and npm test, record AC evidence in impl-2-save-validation-and-deletes.md, and stop at ready-for-review. Do not commit.
```

### Review (fresh reviewer, after implementation)

```text
Use the sdd-review skill in .agents/skills/sdd-review/SKILL.md for .agents/features/20261012-r2-file-storage/plan-2-save-validation-and-deletes.md (spec revision 1). Independently inspect the spec, design.md, plan, report, and real diff. Check that every save path rejects data URLs and foreign keys, HEAD verification, the delete queue on replacement and removal, and the booking image sync. Run npm run typecheck and npm test; record findings in review-2-save-validation-and-deletes.md. Do not edit code or commit.
```

### Ship (only after a pass and explicit user request to commit)

```text
Use the sdd-ship skill in .agents/skills/sdd-ship/SKILL.md for .agents/features/20261012-r2-file-storage/plan-2-save-validation-and-deletes.md (spec revision 1). Verify the latest review passed and the user authorized this commit. Stage only the plan's reviewed files, scan for secrets, commit, and report the hash. Do not push.
```

## Plan 3: Browser uploads, document viewing and image display

### Implement (after user approves this plan)

```text
Use the sdd-implement skill in .agents/skills/sdd-implement/SKILL.md for .agents/features/20261012-r2-file-storage/plan-3-browser-uploads-and-display.md (spec revision 1). Read AGENTS.md, the spec, the plan, and design.md; confirm plan 2 is shipped and run the read-only SDD doctor. Implement Part A, then Part B if the diff stays under 400 lines. Run npm run typecheck, npm test and npm run build, and do the build grep for R2 secrets. Do manual checks only against a dev bucket. Record evidence in impl-3-browser-uploads-and-display.md and stop at ready-for-review. Do not commit.
```

### Review (fresh reviewer, after implementation)

```text
Use the sdd-review skill in .agents/skills/sdd-review/SKILL.md for .agents/features/20261012-r2-file-storage/plan-3-browser-uploads-and-display.md (spec revision 1). Independently inspect the spec, design.md, plan, report, and real diff. Check that a failed PUT never saves a key, that signup no longer handles documents, that signed document URLs are fetched on demand, accessibility of the inputs, and that no R2 secret appears in .next/static. Run npm run typecheck, npm test and npm run build; record findings in review-3-browser-uploads-and-display.md. Do not edit code or commit.
```

### Ship (only after a pass and explicit user request to commit)

```text
Use the sdd-ship skill in .agents/skills/sdd-ship/SKILL.md for .agents/features/20261012-r2-file-storage/plan-3-browser-uploads-and-display.md (spec revision 1). Verify the latest review passed and the user authorized this commit. Stage only the plan's reviewed files, scan for secrets, commit, and report the hash. Do not push.
```

## Plan 4: Base64 migration, account cleanup, bucket and backup docs

### Implement (after user approves this plan)

```text
Use the sdd-implement skill in .agents/skills/sdd-implement/SKILL.md for .agents/features/20261012-r2-file-storage/plan-4-migration-cleanup-and-docs.md (spec revision 1). Read AGENTS.md, the spec, the plan, and design.md; confirm plan 3 is shipped and run the read-only SDD doctor. Implement only this plan; run npm run typecheck and npm test. Run npm run r2:migrate in dry-run mode against the local database and a dev bucket only. Run --execute only if the user approves it in this session. Never run clear-client-provider-data --execute. Record output and payload sizes in impl-4-migration-cleanup-and-docs.md and stop at ready-for-review. Do not commit.
```

### Review (fresh reviewer, after implementation)

```text
Use the sdd-review skill in .agents/skills/sdd-review/SKILL.md for .agents/features/20261012-r2-file-storage/plan-4-migration-cleanup-and-docs.md (spec revision 1). Independently inspect the spec, design.md, plan, report, and real diff. Check that the export is written before any change, re-run safety, counts and exit code, restore correctness, the cleanup script's R2 deletes, and the doc wording for AC15. Run npm run typecheck and npm test; record findings in review-4-migration-cleanup-and-docs.md. Do not run scripts against non-local targets, edit code, or commit.
```

### Ship (only after a pass and explicit user request to commit)

```text
Use the sdd-ship skill in .agents/skills/sdd-ship/SKILL.md for .agents/features/20261012-r2-file-storage/plan-4-migration-cleanup-and-docs.md (spec revision 1). Verify the latest review passed and the user authorized this commit. Stage only the plan's reviewed files (never backups/ or .env files), scan for secrets, commit, and report the hash. Do not push or run the migration elsewhere.
```
