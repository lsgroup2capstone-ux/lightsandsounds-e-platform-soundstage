---
artifact: review
schema: 1
feature: 20261009-booking-schedule
revision: 1
status: pass
risk: high-risk
---

# Review 1: Booking schema

- Plan: `plan-1-booking-schema.md`
- Spec: `spec.md` (revision 4)
- Reviewer: Claude Code, fresh independent reviewer agent (did not implement plan 1)
- Independent from implementation: yes
- Baseline: HEAD `18440c2`, uncommitted working tree
- Diff scope: `database/schema.sql` (lines 66-178, 186); `tests/data/postgres-schema.cjs` (new test at line 115, count 4 → 5, PGlite extension); one-line `new PGlite({ extensions: { btree_gist } })` edits in `tests/auth/{migrate-identities,profiles,profiles-schema,role-set,signup-sms}.cjs` and `tests/data/backup.cjs`; count 4 → 5 in `tests/auth/profiles-schema.cjs`. The app/, scripts/ and tests/ folder restructure and path fix-ups are the user's work, not part of this plan, and were not judged.

## Round 1 (2026-10-17)

- Scope reviewed: all of plan 1
- Verdict: pass (3 minor findings)

### Checks (run by the reviewer)

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass (`tsc --noEmit`, no output) |
| `npm test` | 114/115 pass, exit 1. The one failure is `tests/data/system-activity.cjs` |
| Pre-existing check | Clean `git worktree` at HEAD `18440c2` with `node_modules` junctioned: `node --test tests/system-activity.cjs` also fails (AssertionError). In the working tree it now fails earlier with `Cannot find module '../auth/client-auth'` (folder restructure path). The file does not use `schema.sql` or PGlite. Not caused by plan 1. Temporary worktree removed afterwards. |
| `npm run db:init` | Not run by the reviewer (not authorized). The impl report records a user-authorized hosted apply to Supabase. |

### Decisions

| Decision | Respected? | Evidence |
| --- | --- | --- |
| D2 high-risk | yes | Plan and review carry `risk: high-risk`; additive only, no `DROP TABLE` |
| D3 tables | yes | `database/schema.sql:69,110,122,134,149` |
| D4 statuses | yes | `database/schema.sql:90`, all ten values |
| D5 (constraint part) | yes | `database/schema.sql:102-108`: `EXCLUDE USING gist (provider_email WITH =, daterange(start_date, end_date) WITH &&) WHERE status IN ('confirmed','in_progress')`. The 48h hold is deferred to plan 2 as planned |
| D11 append-only | yes | `database/schema.sql:161-167` raises on UPDATE/DELETE |
| D12 snapshot | yes | `database/schema.sql:168-179` raises on change of name, inclusions or price |

### Acceptance

| Criterion | Met? | Evidence |
| --- | --- | --- |
| AC1 | yes | Tables before blanket REVOKE `database/schema.sql:180`; test `booking schema ...` `tests/data/postgres-schema.cjs:122-123,139-143` (exist after two runs; anon/authenticated denied on all five) |
| AC2 | yes | `database/schema.sql:90`; `tests/data/postgres-schema.cjs:125` (`paid` rejected) |
| AC3 | yes | `database/schema.sql:102-108`; `tests/data/postgres-schema.cjs:127-131` (23P01 for confirmed and in_progress overlap; adjacent `[)` range, other provider and pending allowed) |
| AC8 | yes (schema part; plan 2 adds behavior) | `database/schema.sql:168-179`; `tests/data/postgres-schema.cjs:135-136` |
| AC15 | yes | `database/schema.sql:161-167`; `tests/data/postgres-schema.cjs:133-134` |

### Traceability

| Task | Test/evidence | Result |
| --- | --- | --- |
| T1.1 | `postgres-schema.cjs:120-123,139-143` | met |
| T1.2 | `postgres-schema.cjs:125` | met |
| T1.3 | `postgres-schema.cjs:127-131` | met |
| T1.4 | `postgres-schema.cjs:133-134` | met |
| T1.5 | `postgres-schema.cjs:135-136` | met |
| T1.6 | count 5 and `btree_gist` in `postgres-schema.cjs`; same mechanical edit in other schema-applying tests (documented deviation, justified) | met |

### Idempotency and recovery

- Schema applied twice in the test (`postgres-schema.cjs:120-121`) with no error.
- All objects use `IF NOT EXISTS`, `CREATE OR REPLACE` or drop-trigger/create; the constraint is guarded by a `DO` block. No table is dropped. Version 5 uses `ON CONFLICT DO NOTHING`.

### Findings

| # | Severity | Finding | Where | Required fix |
| --- | --- | --- | --- | --- |
| F1 | minor | The constraint guard checks `pg_constraint` by name only, not by table/namespace. A same-named constraint elsewhere would silently skip creation. | `database/schema.sql:103` | In a later additive revision, add `AND conrelid = 'soundstage.bookings'::regclass` to the guard. |
| F2 | minor | `booking_status_history.old_status`/`new_status` have no CHECK against the ten D4 values, so the audit trail can hold invalid statuses. | `database/schema.sql:113-114` | Additive follow-up: `ALTER TABLE ... ADD CONSTRAINT` (guarded `DO` block) with the D4 value list for both columns (old_status nullable). |
| F3 | minor | Append-only is a row trigger, so `TRUNCATE` by a privileged role bypasses it; also, `REVOKE ALL ON ALL TABLES` does not cover the new `bigserial` sequences. Both are reachable only by owner/service roles today. | `database/schema.sql:166,180` | Additive follow-up: add a `BEFORE TRUNCATE ... FOR EACH STATEMENT` trigger using the same function, and `REVOKE ALL ON ALL SEQUENCES IN SCHEMA soundstage FROM PUBLIC, anon, authenticated`. |

No blocker or major findings.

### Scope check

- Changes outside the plan: test-file PGlite/count edits beyond `postgres-schema.cjs`, documented in impl-1 as required; extra columns/CHECKs beyond design are stricter, not contradictory. Folder restructure is the user's pre-existing work.

### Unverified

- Hosted Supabase state after the user-authorized apply: taken from impl-1 only; not re-checked by the reviewer.
- Expert skills: none applicable (plan lists none).
