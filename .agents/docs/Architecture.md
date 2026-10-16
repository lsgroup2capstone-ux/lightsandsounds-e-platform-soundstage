---
tags:
  - project/architecture
updated: 2026-10-15
---

# Architecture

Related notes: [[Home]] · [[Database]] · [[Modules]] · [[Dependencies]] · [[Decisions]]

## Technology stack

| Layer | Implemented technology | Evidence |
| --- | --- | --- |
| Web application | Next.js 16.3 App Router, React 19, TypeScript 5.7 strict mode | `package.json`, `tsconfig.json`, `app/` |
| UI | Tailwind CSS 4, local shadcn-style primitives, Base UI, Lucide icons | `app/globals.css`, `components/ui/`, `components.json` |
| Authentication | Clerk for protected role routes; transitional Supabase Auth code remains for legacy/API flows | `proxy.ts`, `lib/server/access.ts`, `lib/server/data-service.ts` |
| Database | Supabase-hosted PostgreSQL accessed through the `postgres` driver from server code | `lib/server/database.ts`, `database/schema.sql` |
| File storage | Cloudflare R2 through S3-compatible signed URLs | `lib/server/r2.ts`, `lib/server/file-keys.ts` |
| Payments | PayMongo checkout sessions and a signed webhook; current records still use JSON storage | `lib/server/paymongo.ts`, `app/api/paymongo/webhook/route.ts` |
| Messaging | Gmail SMTP for signed email hooks; PhilSMS for signed SMS hooks | `app/api/auth/send-email/route.ts`, `app/api/auth/send-sms/route.ts` |
| Analytics | Vercel Analytics in production | `app/layout.tsx` |

## Runtime shape

```mermaid
flowchart LR
    Browser[Browser: Next.js pages and client components]
    Proxy[proxy.ts: Clerk claim pre-check]
    Layout[Role layouts: authoritative profile check]
    API[/api/data allowlisted actions]
    Domain[Server domain modules]
    PG[(Supabase PostgreSQL)]
    R2[(Cloudflare R2)]
    PayMongo[PayMongo]
    Hooks[Supabase email/SMS hooks]

    Browser --> Proxy --> Layout
    Browser --> API --> Domain --> PG
    Domain --> R2
    Domain --> PayMongo
    PayMongo --> API
    Hooks --> Browser
```

## Application layers

### Routes and rendering

- Public routes include `/`, `/browse`, `/providers/[id]`, `/services/[id]`, `/listed-services/[id]`, and authentication pages.
- `/client`, `/provider`, `/payroll-master`, and `/admin` each have a server layout that calls `requireRole`.
- `/dashboard` is a role router.
- Provider, Admin, and Payroll Master routes currently share `components/hubs/hub-workspace.tsx`; the approved module specs plan to split role-specific components.
- `app/layout.tsx` wraps the app in Clerk when configured and always installs `DataProvider`.

### Access control

1. `proxy.ts` checks whether a route belongs to a protected area and uses Clerk session claims for a fast redirect.
2. Each protected layout calls `requireRole` in `lib/server/access.ts`.
3. The layout reads `soundstage.profiles`; the database role and account status win over a stale Clerk claim.
4. Browser API requests carry either a Supabase access token or Clerk bearer token to `/api/data`.
5. `lib/server/data-service.ts` authenticates again, restricts the operation to the `actions` allowlist, and applies role/ownership rules.

Client-side visibility is not treated as an authorization boundary. See [[Decisions]] and [[Database]].

### Current data flow

- `DataProvider` refreshes the authorized snapshot on load, browser focus, and every 30 seconds while visible.
- `lib/app-store.ts` serializes browser writes through `/api/data` and stores the returned snapshot in memory.
- The API opens a transaction, takes advisory lock `74832019`, loads every row from `soundstage.records` into `MemoryStorage`, runs one allowlisted domain action, and upserts changed JSON values.
- `visibleRecords()` filters the response by role and ownership. Public visitors receive approved provider/profile data, active services, and a sanitized ratings record.
- R2 object deletion happens after the database commit; failures are logged for cleanup rather than rolling back the committed business change.

This compatibility architecture is implemented. The approved booking/payment plans replace high-value JSON collections with relational tables; those tables are still planned. See [[Database]] and [[Development-Roadmap]].

## API routes

| Route | Current purpose |
| --- | --- |
| `GET/POST /api/data` | Read an authorized snapshot or execute one allowlisted action |
| `POST /api/paymongo/webhook` | Verify a PayMongo signature and settle a matching checkout record |
| `GET/POST /api/auth/signup-sms` | Manage Supabase signup phone verification state |
| `POST /api/auth/send-email` | Deliver signed Supabase email-hook OTP messages through Gmail |
| `POST /api/auth/send-sms` | Deliver signed Supabase SMS-hook OTP messages through PhilSMS |
| `POST /api/auth/admin-login` | Retired endpoint; returns HTTP 410 |
| `POST /api/auth/reset-password` | Retired endpoint; returns HTTP 410 |

## External boundaries

| Boundary | Server-owned controls | Outstanding evidence |
| --- | --- | --- |
| Clerk | Secret kept server-side; role rechecked in `profiles`; privileged signup roles denied | Full browser role/navigation pass and hosted migration checks remain in feature reports |
| Supabase PostgreSQL | Direct server connection; private schema; parameterized queries; advisory transaction lock | Current `.agents/rules/project.md` does not yet list verified routine commands |
| R2 | Server-generated keys; signed PUT/GET; type, size, role, and ownership checks | Real dev-bucket and CORS checks; plan 4 migration/cleanup |
| PayMongo | Server-computed amount; secret server-only; signed webhook | Relational deduplication and event audit are planned, not implemented |
| Email/SMS | Standard Webhooks signatures verified before delivery | Live provider checks are operational, not part of local validation |

## Important structural directories

| Path | Role |
| --- | --- |
| `app/` | Next.js routes, layouts, and API handlers |
| `components/` | Role workspaces, booking/payment UI, auth, site chrome, UI primitives |
| `lib/` | Browser adapters, shared models, domain and server infrastructure |
| `database/` | Current PostgreSQL schema and legacy SQL Server reference |
| `supabase/` | Local Supabase CLI configuration and templates; no migration files currently exist |
| `tests/` | Node test suites, including embedded PGlite schema/domain tests |
| `.agents/features/` | Durable SDD artifacts; indexed by [[Feature-Index]] |
| `.agents/docs/` | This Obsidian vault |

The root `G2-Sound-Stage/` and `sdd-kit/` entries contain only nested `.git` metadata in the inspected workspace and are not application modules.
