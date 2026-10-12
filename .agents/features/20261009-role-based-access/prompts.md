# Prompts: Shared authentication and role-based access

Use each block in a fresh session at the stated gate. Order: plan 1, 2, 3, 4. Scoped operations (schema apply, `role:set`, Clerk session-token setting, `auth:profiles`) are run by the user, never by these sessions.

## Plan 1: Profiles table, server identity resolution, and role:set

### Implement (after user approves this plan)

```text
Use the sdd-implement skill in .agents/skills/sdd-implement/SKILL.md for .agents/features/20261009-role-based-access/plan-1-profiles-and-identity.md (spec revision 3). Read AGENTS.md, the spec, the plan, and .agents/features/20261009-role-based-access/design.md. Confirm the plan is approved, then run the read-only SDD doctor before editing. Implement only plan 1, apply its listed expert skills, run npm run typecheck and npm test, record AC evidence in impl-1-profiles-and-identity.md, and stop at ready-for-review. Do not commit, run db:init, role:set, auth:profiles, or change Clerk settings.
```

### Review (fresh reviewer, after implementation)

```text
Use the sdd-review skill in .agents/skills/sdd-review/SKILL.md for .agents/features/20261009-role-based-access/plan-1-profiles-and-identity.md (spec revision 3). Independently inspect the spec, design, plan, impl-1-profiles-and-identity.md, and the real diff. Run npm run typecheck and npm test yourself; security and data-integrity ACs need executed test evidence, not inspection alone. Record findings, AC evidence, and unverified items in review-1-profiles-and-identity.md. Pass only when the review gate is met. Do not edit implementation code or commit.
```

### Ship (only after a pass and explicit user request to commit)

```text
Use the sdd-ship skill in .agents/skills/sdd-ship/SKILL.md for .agents/features/20261009-role-based-access/plan-1-profiles-and-identity.md (spec revision 3). Verify the latest independent review passed and the user explicitly authorized this commit. Stage only the plan's reviewed files, scan the staged diff for secrets, commit, and report the hash and remaining status. Do not push, merge, deploy, or run scoped operations unless separately requested.
```

## Plan 2: Access rules, server helpers, and proxy

### Implement (after user approves this plan)

```text
Use the sdd-implement skill in .agents/skills/sdd-implement/SKILL.md for .agents/features/20261009-role-based-access/plan-2-access-rules-and-proxy.md (spec revision 3). Read AGENTS.md, the spec, the plan, and .agents/features/20261009-role-based-access/design.md. Confirm this plan and plan 1 are approved, then run the read-only SDD doctor before editing. Implement only plan 2, apply its listed expert skills, run npm run typecheck and npm test, record AC evidence in impl-2-access-rules-and-proxy.md, and stop at ready-for-review. Do not commit, run db:init, role:set, auth:profiles, or change Clerk settings.
```

### Review (fresh reviewer, after implementation)

```text
Use the sdd-review skill in .agents/skills/sdd-review/SKILL.md for .agents/features/20261009-role-based-access/plan-2-access-rules-and-proxy.md (spec revision 3). Independently inspect the spec, design, plan, impl-2-access-rules-and-proxy.md, and the real diff. Run npm run typecheck and npm test yourself; security and data-integrity ACs need executed test evidence, not inspection alone. Record findings, AC evidence, and unverified items in review-2-access-rules-and-proxy.md. Pass only when the review gate is met. Do not edit implementation code or commit.
```

### Ship (only after a pass and explicit user request to commit)

```text
Use the sdd-ship skill in .agents/skills/sdd-ship/SKILL.md for .agents/features/20261009-role-based-access/plan-2-access-rules-and-proxy.md (spec revision 3). Verify the latest independent review passed and the user explicitly authorized this commit. Stage only the plan's reviewed files, scan the staged diff for secrets, commit, and report the hash and remaining status. Do not push, merge, deploy, or run scoped operations unless separately requested.
```

## Plan 3: Section layouts, dashboard router, and sign-in redirects

### Implement (after user approves this plan)

```text
Use the sdd-implement skill in .agents/skills/sdd-implement/SKILL.md for .agents/features/20261009-role-based-access/plan-3-layouts-and-redirects.md (spec revision 3). Read AGENTS.md, the spec, the plan, and .agents/features/20261009-role-based-access/design.md. Confirm this plan and plan 2 are approved, then run the read-only SDD doctor before editing. Implement only plan 3, apply its listed expert skills, run npm run typecheck and npm test, record AC evidence in impl-3-layouts-and-redirects.md, and stop at ready-for-review. Do not commit, run db:init, role:set, auth:profiles, or change Clerk settings.
```

### Review (fresh reviewer, after implementation)

```text
Use the sdd-review skill in .agents/skills/sdd-review/SKILL.md for .agents/features/20261009-role-based-access/plan-3-layouts-and-redirects.md (spec revision 3). Independently inspect the spec, design, plan, impl-3-layouts-and-redirects.md, and the real diff. Run npm run typecheck and npm test yourself; security and data-integrity ACs need executed test evidence, not inspection alone. Record findings, AC evidence, and unverified items in review-3-layouts-and-redirects.md. Pass only when the review gate is met. Do not edit implementation code or commit.
```

### Ship (only after a pass and explicit user request to commit)

```text
Use the sdd-ship skill in .agents/skills/sdd-ship/SKILL.md for .agents/features/20261009-role-based-access/plan-3-layouts-and-redirects.md (spec revision 3). Verify the latest independent review passed and the user explicitly authorized this commit. Stage only the plan's reviewed files, scan the staged diff for secrets, commit, and report the hash and remaining status. Do not push, merge, deploy, or run scoped operations unless separately requested.
```

## Plan 4: Migrate Supabase users to Clerk profiles

### Implement (after user approves this plan)

```text
Use the sdd-implement skill in .agents/skills/sdd-implement/SKILL.md for .agents/features/20261009-role-based-access/plan-4-supabase-user-migration.md (spec revision 3). Read AGENTS.md, the spec, the plan, and .agents/features/20261009-role-based-access/design.md. Confirm this plan and plan 1 are approved, then run the read-only SDD doctor before editing. Implement only plan 4, apply its listed expert skills, run npm run typecheck and npm test, record AC evidence in impl-4-supabase-user-migration.md, and stop at ready-for-review. Do not commit, run db:init, role:set, auth:profiles, or change Clerk settings.
```

### Review (fresh reviewer, after implementation)

```text
Use the sdd-review skill in .agents/skills/sdd-review/SKILL.md for .agents/features/20261009-role-based-access/plan-4-supabase-user-migration.md (spec revision 3). Independently inspect the spec, design, plan, impl-4-supabase-user-migration.md, and the real diff. Run npm run typecheck and npm test yourself; security and data-integrity ACs need executed test evidence, not inspection alone. Record findings, AC evidence, and unverified items in review-4-supabase-user-migration.md. Pass only when the review gate is met. Do not edit implementation code or commit.
```

### Ship (only after a pass and explicit user request to commit)

```text
Use the sdd-ship skill in .agents/skills/sdd-ship/SKILL.md for .agents/features/20261009-role-based-access/plan-4-supabase-user-migration.md (spec revision 3). Verify the latest independent review passed and the user explicitly authorized this commit. Stage only the plan's reviewed files, scan the staged diff for secrets, commit, and report the hash and remaining status. Do not push, merge, deploy, or run scoped operations unless separately requested.
```
