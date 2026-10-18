# Review 8: plan 4 rewire and compatibility (fix round 3)

Verdict: **pass**

## Prior finding
- M1 (review-6) resolved via shared `downpaymentFor` (core.ts:11) in compat.ts:66 and core confirm paths.

## New changes checked
- `cancelEvent(id, reason)` (lib/server/data-service.ts:214) requires provider role and routes through `bookingCore.transition`; the rules table (lib/server/bookings/rules.ts:20) only allows provider confirmed -> cancelled with a reason check, so other statuses are refused. UI (components/hubs/provider/provider-content.tsx:70,73) shows Cancel only for confirmed and requires a non-empty prompt reason.
- Lowercase status handling in event-notifications.tsx, refunds-panel.tsx, hub-data.ts badge styles accept both legacy and new statuses; no regression seen in diff.

## Minors
- event-notifications.tsx also contains the user's own uncommitted provider-message notification additions; they ship with this plan by the user's request. Not in plan scope; untested beyond tsc/build.
- Cancel reason uses window.prompt (functional, not styled/accessible dialog).

Checks (run this session): npm test 154/154 pass (0 fail); npx tsc --noEmit -p . exit 0; npm run build success. Lint not runnable (no ESLint config, pre-existing). bookings:migrate not run.
Manual outstanding: PayMongo test-mode webhook with real secret, screen reader on return page, UI click-through, local migration dry run.
