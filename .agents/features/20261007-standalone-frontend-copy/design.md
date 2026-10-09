# Design: Standalone frontend copy

- Feature: `.agents/features/20261007-standalone-frontend-copy/spec.md`
- Spec revision: 1
- Risk lane: quick with design required

## Context and constraints

- The result is a standalone Next.js App Router project rooted at `frontend-copy/`.
- Runtime source must not import from the parent application.
- The copy is a frontend demonstration. It does not authenticate users or call production services.
- The existing SoundStage palette and information architecture remain recognizable.
- The dependency manifest reuses versions already present in the parent repository where practical.

## Ownership and data flow

- `frontend-copy/lib/contracts.ts` owns UI-facing domain types and the `FrontendService` interface.
- `frontend-copy/lib/demo-data.ts` owns fictional seed records.
- `frontend-copy/lib/demo-service.ts` implements the interface with browser-local state and simulated latency.
- `frontend-copy/components/service-provider.tsx` owns the service instance and exposes it through a React context hook.
- Route and feature components consume only the interface. A future integration can replace the provider value without rewriting screen components.
- No demo mutation crosses a network boundary. Reload behavior is documented and may use local storage only for fictional records.

## Contracts

- `FrontendService`: loads dashboard data and exposes reset-request, booking, message, report, refund, feedback, notification, and profile mutations.
- Every mutation resolves with updated UI-facing data or throws a safe `Error` message that the component renders as a status.
- `/dashboard`: client-rendered dashboard demonstration with all specified panels.
- `/forgot-password`: client-rendered password-reset demonstration that validates input and reports simulated success or failure.
- `/`: redirects locally to `/dashboard` and has no authentication behavior.

## Failure, security, and rollback

- Failure path: demo services reject invalid form data with user-safe messages; components retain entered data and restore actionable controls.
- Trust boundaries and control owners: there is no server trust boundary in this copy. The future backend adapter owns authentication, authorization, storage, payment, and authoritative data controls.
- Authorization/privacy and negative cases: the demo never represents client-side state as authorization and contains only fictional identities, bookings, and payment references.
- Rollback or forward recovery: remove `frontend-copy/` and the feature artifacts. No existing runtime file or production data changes.

## Non-functional evidence

- Performance: use local CSS and data, avoid remote assets, and verify with a production build.
- Accessibility: use semantic buttons, forms, dialog semantics, focus management, labelled status regions, and keyboard-reachable tab navigation; verify manually with keyboard interaction.
- Observability: render loading, success, empty, validation, and failure states in the relevant screen.

## Alternatives rejected

- Static HTML/CSS/JavaScript: rejected because the user selected a standalone Next.js project.
- Copying current backend modules: rejected because the user already has Clerk, Supabase, and Cloudflare R2 and requested only the frontend.
- Importing parent application components: rejected because the copy must remain portable and isolated.
- Publishing through Sites: deferred because the user requested a local frontend copy and did not authorize deployment.
