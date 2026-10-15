---
artifact: plan
schema: 1
feature: 20261009-provider-module
revision: 1
status: plan-approved
risk: high-risk
---

# Plan 1: Unverified provider lock

- Feature: `.agents/features/20261009-provider-module/spec.md`
- Design: none (single gate at an existing boundary; no schema or contract change)
- Implements decisions: D14
- Spec revision: 6
- Depends on: none
- Status: plan-approved
- Estimate: about 150 lines of diff

## Goal

A provider whose application is not `Approved` (none submitted, `Pending`, or
`Rejected`) can use only `/provider/application`. The provider sidebar shows all
other items greyed out with a lock icon, any other `/provider/*` URL redirects to
`/provider/application` with an "awaiting verification" notice, and the data API
rejects every provider action except those needed to submit the application.
Approval unlocks everything on the next page load.

## Evidence (checked in the repository)

- `lib/server/domain/client-auth.ts:4`: `ProviderApplication.status` is `"Pending" | "Approved" | "Rejected"`; a provider with no application has `application` undefined.
- `lib/server/domain/client-auth.ts:24`: `isProviderApproved(email)` already exists server-side.
- `lib/client-auth.ts:206`: client-side `isProviderApproved(email)` and `getAccount()` (line 200) read the synced app store.
- `lib/hub-data.ts:42`: `hubNav.provider` lists the sidebar items, including `"/provider/application"` and `"/logout"`.
- `components/hubs/hub-workspace.tsx:326-363`: `HubWorkspace` resolves the section, holds `providerAccount` (refreshed on `soundstage-account-updated`, line 349-355), and renders `nav.map(([label, href]) => <Link …>)` at line 363.
- `components/hubs/hub-workspace.tsx:347`: existing client-side redirect pattern with `router.replace`.
- `app/provider/[[...slug]]/page.tsx:3-6`: every provider route renders `HubWorkspace` with `initialPath`.
- `app/provider/layout.tsx:6-10`: server layout only checks the role via `requireRole("provider")`; approval data lives in `soundstage.records`, loaded only inside `execute`.
- `lib/server/data-service.ts:389-414`: `execute` authenticates, resolves `identity` (email, role) inside the request context; this is the trusted boundary for every action.
- `lib/server/data-service.ts:158-340`: `actions` map; provider-reachable actions include `createUploadUrl` (192), `getProviderDocumentUrl` (206), `updateProviderAccount` (215), `submitProviderApplication` (217), `saveProviderService` (231), `updateProviderServices` (236), `updateClientBookingStatus` (282), `createSubscriptionCheckout` (299), `submitSubscriptionPayment` (321), `sendBookingMessage` (323), `createWithdrawalRequest` (332), `toggleScheduleDate` (183), `setNotificationReads` (163).
- `lib/server/domain/provider-services.ts:48,58`: publishing already rejects unapproved providers (kept).

## Phases

### Phase 1: Server gate (trusted boundary)

- In `lib/server/data-service.ts`, add `const UNAPPROVED_PROVIDER_ACTIONS = new Set(["submitProviderApplication", "createUploadUrl", "getProviderDocumentUrl", "setNotificationReads"])`.
- In `execute`, after `identity` is resolved and before dispatching the action: if `identity.role === "provider"`, an `action` is present, and `!isProviderApproved(identity.email)`, then throw `new RequestError("Your provider account is awaiting verification.", 403)` unless the action is in the set.
- For `createUploadUrl` from an unapproved provider, additionally require the upload kind to be `"provider-document"`; otherwise 403 with the same message.
- Read-only GET (no `action`) is unchanged.

### Phase 2: UI lock

- In `lib/hub-data.ts`, export `PROVIDER_UNLOCKED_PATHS = ["/provider/application", "/logout"]` and a helper `isProviderPathLocked(path, approved)`.
- In `HubWorkspace`, derive `providerApproved = providerAccount?.application?.status === "Approved"` (only once `providerAccount` has loaded, to avoid a redirect flash).
- Sidebar: for `section.kind === "provider"` and not approved, render locked items as a non-link `<span aria-disabled="true">` with muted styling and a `Lock` icon from `lucide-react`, plus `title="Available after your application is approved"`.
- Redirect: an effect that, when the provider is loaded, not approved, and the current path is locked, calls `router.replace("/provider/application?locked=1")`.
- On `/provider/application`, when `locked=1` is present or the provider is unapproved, show a banner: "Your account is awaiting verification. Other features unlock once an administrator approves your application." For `Rejected`, include the existing rejection reason.
- AC2a: approval is read from `getAccount()` on mount and on `soundstage-account-updated`, so the next page load after approval unlocks without sign-out. No extra code beyond confirming this.

## Tasks and traceability

| Task | Depends on | Files/area | Acceptance criteria | Test/evidence |
| --- | --- | --- | --- | --- |
| T1.1 | none | `lib/server/data-service.ts` | AC2 (server rejection) | new `tests/provider-lock.cjs`: unapproved provider gets 403 on `saveProviderService`, `updateClientBookingStatus`, `createWithdrawalRequest`, `updateProviderAccount`; allowed on `submitProviderApplication`; `createUploadUrl` allowed only for `provider-document`; approved provider unaffected |
| T1.2 | none | `lib/hub-data.ts` | AC2 (which paths lock) | `tests/provider-lock.cjs`: `isProviderPathLocked` for each `hubNav.provider` href, approved vs not |
| T1.3 | T1.2 | `components/hubs/hub-workspace.tsx` | AC2 (sidebar, redirect, banner) | manual check below |
| T1.4 | T1.1, T1.3 | none (verification) | AC2a | manual: approve as admin, reload provider page, all tabs unlocked without sign-out |

## Tests

- Server gate and path helper → `tests/provider-lock.cjs` (node:test, same style as `tests/access.cjs`), added to the `test` script in `package.json`.
- Sidebar, redirect and banner → manual browser check (no browser test tooling yet; the paused e2e spec will add one).

## Out of scope

- Everything else in the provider-module spec (profile, portfolio, packages, availability, bookings, payments, subscription, feedback): later plans.
- The spec's own Out of scope list applies unchanged.
- Playwright e2e tests (separate, paused spec).

## Acceptance

- Spec: AC2, AC2a.
- Technical: enforcement lives in `execute` (server); UI lock is convenience only. No schema or data migration.

## Verification

- Routine local checks: `npm test`, `npm run typecheck`, `npm run lint`.
- Scoped operations: none (no database writes beyond local dev usage).
- Manual (`npm run dev`):
  1. Provider with no application: only "My application" and "Log out" are clickable; others greyed with lock icon.
  2. Type `/provider/bookings` in the URL: redirected to `/provider/application` with the banner.
  3. Submit the application (status `Pending`): still locked, banner shown.
  4. As admin, reject: provider sees reason, still locked. Approve: provider reloads, all tabs unlocked.

## Expert skills to apply

- none found for this step beyond the base rules (security.md for the server gate).

## Risks and stop points

- The GET snapshot from `/api/data` may expose provider data (bookings, earnings) to an unapproved provider even with the UI locked. → Implementer checks what GET returns for a provider; if it includes locked-area data, stop and report rather than widening the plan.
- A provider page may call an action not listed above on load (for example `setNotificationReads`) and break the Application tab. → If the Application tab needs another action, stop and report it; do not silently widen the allowlist.
- `hub-workspace.tsx` and `lib/hub-data.ts` have uncommitted changes from other work. → Run `git status` first; per AGENTS.md, stop and report before editing them.
