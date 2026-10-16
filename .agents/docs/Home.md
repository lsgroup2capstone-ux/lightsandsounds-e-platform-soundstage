---
aliases:
  - SoundStage Knowledge Base
tags:
  - project/dashboard
updated: 2026-10-15
---

# Lights and Sounds E-Platform

This vault summarizes the repository as inspected on 2026-10-15. It is a navigation and handoff layer, not a replacement for approved specs, plans, reviews, or source code. When facts differ, use the feature spec for intended behavior and the source plus executed checks for implemented behavior.

## Project dashboard

| Area | Note | Purpose |
| --- | --- | --- |
| System | [[Architecture]] | Runtime layers, integrations, routes, and trust boundaries |
| Data | [[Database]] | Current Supabase PostgreSQL schema, JSON record model, RLS, and planned tables |
| Product | [[Modules]] | Client, Provider, Payroll Master, and Admin capabilities |
| Relationships | [[Dependencies]] | Feature and module dependency graph |
| Delivery | [[Agent-Progress]] | Evidence-based feature status |
| Next work | [[Development-Roadmap]] | Prioritized remaining work |
| Quality | [[Bug-Tracker]] | Reproducible issues and review follow-ups |
| Governance | [[Decisions]] | Approved directions and ADR status |
| Features | [[Feature-Index]] | One note for every folder in `.agents/features/` |

## Current snapshot

- Authentication and role-based route protection are shipped according to `.agents/state/tasks.md`; hosted migration and browser checks remain explicitly outstanding.
- The application currently persists most marketplace data as JSON values in `soundstage.records`; relational booking, payment, refund, payout, feedback, notification, audit, and settings tables are specified or planned, not present in `database/schema.sql`.
- Provider-first browsing and service ratings are implemented in the working tree and await independent review.
- The Provider lock passed review and awaits an explicitly authorized ship step.
- R2 file storage plans 1-3 passed review; migration, cleanup, and documentation plan 4 remains.
- Payroll Master has a role-protected hub shell in the working tree, while its financial workflows remain specified but unimplemented as relational modules.

## Source-of-truth order

1. Current user instruction and repository rules in `AGENTS.md`.
2. Approved feature `spec.md` and approved plan files.
3. Independent review artifacts and `.agents/state/tasks.md`.
4. Actual application code, tests, and schema for implemented behavior.
5. This vault as a derived overview.

## Working conventions

- Use wiki links such as [[Database]], [[Modules]], and [[Architecture]] to keep the Obsidian graph connected.
- Use [[Feature-Index]] before starting or resuming feature work.
- Record a problem in [[Bug-Tracker]] only with a repository path, review finding, or reproducible command.
- Update [[Agent-Progress]] only after checking the real SDD status and validation evidence.
- Do not put credentials, tokens, account passwords, or `.env` values in this vault.

## Operational references outside this vault

- `docs/clerk-google-setup.md`
- `docs/supabase-auth-setup.md`
- `docs/gmail-email-otp.md`
- `docs/philsms-setup.md`
- `docs/paymongo.md`
- `docs/backup-restore.md`

These files contain setup procedures. Some historical wording may lag the newer Clerk/profile architecture; verify it against [[Architecture]], [[Database]], and the current source before following it.
