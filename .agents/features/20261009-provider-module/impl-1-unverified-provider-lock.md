---
artifact: implementation
schema: 1
feature: 20261009-provider-module
revision: 1
status: ready-for-review
risk: high-risk
---

# Implementation 1: Unverified provider lock

- Plan: `plan-1-unverified-provider-lock.md`
- Part: all
- Date: 2026-10-13
- Spec revision: 6

## Summary

`execute` now rejects every action from a provider whose application is not `Approved` with 403 "Your provider account is awaiting verification.". The only exceptions are `submitProviderApplication`, `getProviderDocumentUrl`, `setNotificationReads` and `createUploadUrl`, and `createUploadUrl` is allowed only for the `provider-document` kind. In the provider sidebar, every item except "My application" and "Log out" is a greyed, non-link item with a lock icon. Any other `/provider/*` path redirects to `/provider/application?locked=1`, and an awaiting-verification banner shows. For a rejected application, the banner also includes the admin's feedback.

## Files changed

| File | Change |
| --- | --- |
| `lib/server/provider-lock.ts` | New: `UNAPPROVED_PROVIDER_ACTIONS` allowlist and `assertProviderActionAllowed(role, approved, action, args)` |
| `lib/server/data-service.ts` | Import the gate and call it in `execute` after the identity and account resolve, before the action runs |
| `lib/hub-data.ts` | `PROVIDER_UNLOCKED_PATHS` and `isProviderPathLocked(path, approved)` |
| `components/hubs/hub-workspace.tsx` | Locked sidebar items (`span[aria-disabled]` with `Lock` icon and title), redirect effect, verification banner; `ProviderContent` no longer exempts `settings` for unapproved providers |
| `tests/provider-lock.cjs` | New node:test file (5 tests) |
| `package.json` | Adds `tests/provider-lock.cjs` to the `test` script |

## Deviations from the plan

- The plan put the allowlist and check directly in `data-service.ts`. They are in `lib/server/provider-lock.ts` instead, and `execute` calls them in one line. This lets the gate be unit-tested without loading the database and auth stack that `data-service.ts` imports. The behavior matches the plan. A test also checks the source to confirm `execute` calls the gate before `actions[action]`.
- The banner shows whenever the signed-in provider is unapproved, without reading `?locked=1`. The plan's condition is "locked=1 or unapproved", and `locked=1` only happens for unapproved providers, so the result is the same. This avoids `useSearchParams`, which would need a Suspense boundary.
- `ProviderContent` (`hub-workspace.tsx`, in the `if (section.dataKey === "application" || ...)` line) used to render Settings for unapproved providers. Settings is now locked like every other tab, which matches D14 and AC2. Without this change, the Settings form would have shown briefly before the redirect, and saving it would now get a 403.

## Checks (actually run)

| Command | Result |
| --- | --- |
| `node --test tests/provider-lock.cjs` | pass (5/5) |
| `npm test` | pass (98/98, 0 fail) |
| `npm run typecheck` | pass (`tsc --noEmit`, no output) |
| `npm run lint` | not run successfully: `'eslint' is not recognized as an internal or external command`. Running `npx eslint` instead fails with "ESLint couldn't find an eslint.config.* file". No ESLint config is tracked or present in the repo. |
| build | not run (not listed in the plan's routine checks) |

Pre-existing failures confirmed on the previous commit: lint is unavailable for an environment and config reason (no ESLint config is in the repository, and this change does not touch any lint setup). I did not reproduce this in a clean worktree.

## Manual checks

- Done: none.
- Not done: plan Verification steps 1 to 4 (sidebar lock, URL redirect with banner, Pending still locked, reject shows reason and approve unlocks after reload, which covers AC2a). These need `npm run dev` with Clerk/Supabase sign-in and an admin account, which I did not run in this session. AC2a needed no code: `HubWorkspace` and `ProviderContent` read `getAccount()` on mount, and the server re-checks approval on every request.

## Notes for the reviewer

- Stop point 1 (GET snapshot): I checked `visibleRecords()`. For any provider it returns only their own data: their own services, bookings they own, their own schedule, notifications, withdrawals and billing rows. It returns no other provider's private data. An unapproved provider normally has none of this anyway, since they cannot publish and so cannot be booked. A provider moved from Approved back to Rejected would still receive their own past data through GET. As the plan says, I did not widen the plan to change GET. Decide whether a follow-up should filter it.
- Stop point 2: the Application tab (`components/hubs/provider-applications.tsx`) calls only `getProviderDocumentUrl`, `createUploadUrl` (through `uploadProviderDocuments`, kind `provider-document`) and `submitProviderApplication`, all on user action. Nothing runs on load. The allowlist did not need widening.
- The redirect and the lock wait for `providerAccount` to load (`providerApproved` stays `undefined` until then), so there is no flash redirect for approved providers.
- I found no expert skills for this step beyond the base rules. I applied `security.md`: enforcement is server-side, and the UI is convenience only.
- Unrelated: the repository has no ESLint config, and `eslint` is not installed locally, so `npm run lint` cannot run.

## Outcome metrics

- Lead time: not measured
- Spec changes after implementation began: 0
- Review rounds: 0
- Automated acceptance coverage: AC2 server rejection and path locking covered by unit tests; UI and AC2a manual only
- Escaped defects: unknown
