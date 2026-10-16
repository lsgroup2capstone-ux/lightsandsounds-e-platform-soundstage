# Prompts: PayMongo payment module

Planned together with booking-schedule. For the full order, see `.agents/features/20261009-booking-schedule/prompts.md`. These two plans run after booking plans 1–3 and before booking plan 4.

## Plan 1: Payment tables and verified webhook

### Implement (after user approves this plan)

```text
Use the sdd-implement skill in .agents/skills/sdd-implement/SKILL.md for .agents/features/20261009-paymongo-payments/plan-1-payment-tables-and-webhook.md (spec revision 3). Read AGENTS.md, the spec, the plan, and .agents/features/20261009-booking-schedule/design.md. Confirm booking-schedule plans 1-2 are shipped and this plan is approved; run the read-only SDD doctor before editing. Implement only this plan; run applicable local checks, record AC evidence in impl-1-payment-tables-and-webhook.md, and stop at ready-for-review. Never print or commit PayMongo secrets. Do not commit or perform scoped external operations.
```

### Review (fresh reviewer, after implementation)

```text
Use the sdd-review skill in .agents/skills/sdd-review/SKILL.md for .agents/features/20261009-paymongo-payments/plan-1-payment-tables-and-webhook.md (spec revision 3). Independently inspect the spec, plan, shared design.md, implementation report, and real diff, with attention to signature-before-parse, event deduplication, rollback on failure, and exact amount matching. Run applicable local checks; record findings in review-1-payment-tables-and-webhook.md. Give a pass only when its gate is met. Do not edit implementation code or commit.
```

### Ship (only after a pass and explicit user request to commit)

```text
Use the sdd-ship skill in .agents/skills/sdd-ship/SKILL.md for .agents/features/20261009-paymongo-payments/plan-1-payment-tables-and-webhook.md (spec revision 3). Verify the latest independent review passed and the user authorized this commit. Stage only the plan's reviewed files, scan the staged diff for secrets, commit, and report the hash. Do not push, merge, deploy, or change the PayMongo dashboard.
```

## Plan 2: Checkout and return page

### Implement (after user approves this plan)

```text
Use the sdd-implement skill in .agents/skills/sdd-implement/SKILL.md for .agents/features/20261009-paymongo-payments/plan-2-checkout-and-return-page.md (spec revision 3). Read AGENTS.md, the spec, the plan, and the shared design.md. Confirm payments plan 1 is shipped and this plan is approved; run the read-only SDD doctor before editing. Implement only this plan; run applicable local checks, record AC evidence in impl-2-checkout-and-return-page.md, and stop at ready-for-review. Do not commit or perform scoped external operations.
```

### Review (fresh reviewer, after implementation)

```text
Use the sdd-review skill in .agents/skills/sdd-review/SKILL.md for .agents/features/20261009-paymongo-payments/plan-2-checkout-and-return-page.md (spec revision 3). Independently inspect the spec, plan, shared design.md, implementation report, and real diff, with attention to server-computed amounts, ownership, and that nothing marks a payment paid outside the webhook. Run applicable local checks; record findings in review-2-checkout-and-return-page.md. Give a pass only when its gate is met. Do not edit implementation code or commit.
```

### Ship (only after a pass and explicit user request to commit)

```text
Use the sdd-ship skill in .agents/skills/sdd-ship/SKILL.md for .agents/features/20261009-paymongo-payments/plan-2-checkout-and-return-page.md (spec revision 3). Verify the latest independent review passed and the user authorized this commit. Stage only the plan's reviewed files, scan for secrets, commit, and report the hash. Do not push, merge, or deploy.
```
