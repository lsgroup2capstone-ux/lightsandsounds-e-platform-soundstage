# Prompts: 20261018-relational-data (spec revision 2)

Plans 1-3 are superseded. Plan 4 is implemented and `ready-for-review`.

## Review plan 4

```
/sdd-review .agents/features/20261018-relational-data/plan-4-core-tables.md
Spec: .agents/features/20261018-relational-data/spec.md (rev 2). Report: impl-4-core-tables.md.
Focus: database/schema.sql vs database/migrate-to-core-tables.sql, record-store mappings, booking/payment rewrites. Run npm test.
```

## Ship (only after the review passes and the user asks)

```
/sdd-ship .agents/features/20261018-relational-data/plan-4-core-tables.md
Commit by explicit path. The user runs database/migrate-to-core-tables.sql in Supabase, then deploys.
```
