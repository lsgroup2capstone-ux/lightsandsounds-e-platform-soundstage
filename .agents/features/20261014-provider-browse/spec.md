---
artifact: spec
schema: 1
feature: 20261014-provider-browse
revision: 2
status: spec-approved
risk: standard
---

# Provider-first browse

- Feature id: 20261014-provider-browse
- Revision: 2 (rev 2: approved providers without services are listed; user approved 2026-10-14)
- Status: spec-approved
- Risk lane: standard
- Approved by: user, 2026-10-14
- Related decisions: none

## Problem

`/browse` lists individual packages, not providers, and there is no public page
showing everything one provider offers. Category and price filters exist but are
hidden behind a toggle, and the category filter is meaningless because services
have no category.

Facts found in the code:

- `app/browse/page.tsx` renders `components/browse/services-browser.tsx`, which builds its list from `getProviderServices()` (`lib/provider-services.ts`) plus `packages`, showing package cards.
- `ProviderService` (`lib/provider-services.ts:4`) has no category; the browser hard-codes `category: "Full Production"` for every published service (`services-browser.tsx:41`).
- Categories are defined as `ServiceCategory` in `lib/mock-data.ts:1`: Sound System, Lighting, Full Production, Band & Stage.
- Price bands already exist in `services-browser.tsx:21` (Any, <15k, 15k-30k, >30k); category/price filters are chips behind a toggle.
- Providers create services in `components/hubs/hub-workspace.tsx` (~line 191, `saveProviderService`).
- `getProviderServices("all")` returns only services of approved providers (`isProviderApproved`).
- No public provider page exists; only `app/services/[id]`.
- `20261009-client-module` spec D4 said public `/browse` stays unchanged; this feature supersedes that for `/browse` only.

## Decisions

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | Risk lane | Standard | Small additive data field, no money/auth change. |
| D2 | What `/browse` lists | Provider cards only (name, location, active service count, "from PHP X" lowest active price). | User wants provider-first browsing. |
| D3 | Provider click target | New public page `/providers/[id]`: header (name, location, coverage areas, bio/description) and grid of all the provider's active services, each linking to existing `/services/[id]`. | Linkable, reuses service detail page. |
| D4 | Service category source | Add required `category: ServiceCategory` to `ProviderService`, chosen in the provider service form; existing services without one are treated as Full Production. | Makes the Category filter meaningful. |
| D5 | Filter semantics | A provider is shown if at least one active service matches both the selected category and price band. | Intuitive "can this provider do it in my budget". |
| D6 | Filter controls | Two always-visible dropdowns beside search: Category (All + 4 categories) and Price (existing 4 bands). Old chip toggle removed. | User request. |
| D7 | Search and sort | Search matches provider name, location, and service names. Sort: Recommended, Lowest starting price, Highest starting price. | Fits provider cards. |
| D9 | Providers without services (rev 2) | Every approved provider is listed, even with no active services: card shows "No services yet" instead of a price; profile page shows an empty services state. They appear only when no category/price filter is set, and sort after priced providers. | User wants new providers visible. |
| D8 | client-module conflict | Add a note to client-module D4 that `/browse` is owned by this feature. | Keep specs consistent. |

## Out of scope

- Package-card view or Providers/Packages toggle on `/browse`: rejected (D2).
- Modal provider view: rejected (D3).
- New categories or new price bands: keep existing.
- Ratings/reviews on provider cards: no real data yet.
- Changes to `/services/[id]` and the booking flow.

## Acceptance criteria

- AC1: WHEN a visitor opens `/browse`, THE SYSTEM SHALL show one card per approved provider, showing name, location, active service count and lowest active price ("No services yet" when the provider has none).
- AC2: WHEN a visitor clicks a provider card, THE SYSTEM SHALL navigate to `/providers/[id]` for that provider.
- AC3: WHEN `/providers/[id]` loads, THE SYSTEM SHALL show the provider header and all that provider's active services, each linking to `/services/[serviceId]`.
- AC4: IF `/providers/[id]` refers to an unknown or unapproved provider, THEN THE SYSTEM SHALL show a "provider not found" state with a link back to `/browse`.
- AC5: THE SYSTEM SHALL show Category and Price dropdowns next to the search box at all times on `/browse`.
- AC6: WHEN a category and/or price band is selected, THE SYSTEM SHALL show only providers with at least one active service matching both.
- AC7: WHEN a search term is entered, THE SYSTEM SHALL match it against provider name, location, and service names (case-insensitive).
- AC8: WHEN a sort option is chosen, THE SYSTEM SHALL order providers by Recommended (default order), lowest starting price ascending, or highest starting price descending.
- AC9: WHEN a provider creates or edits a service, THE SYSTEM SHALL require choosing one of the four categories and save it on the service.
- AC10: IF a stored service has no category, THEN THE SYSTEM SHALL treat it as Full Production everywhere.
- AC12: WHEN an approved provider has no active services, THE SYSTEM SHALL show their profile page with a "No services yet" state, and list them on `/browse` only while no category or price filter is set, sorted after providers with prices.
- AC11: IF no providers match, THEN THE SYSTEM SHALL show an empty state with a Clear filters action (or "no providers yet" when none exist).

## Non-functional and operational checks

| Area | Requirement or `not applicable` with reason | Evidence |
| --- | --- | --- |
| Security | Only approved providers' active services are public (reuse `getProviderServices` approval filter). | Code review, manual check |
| Privacy | Provider page shows no email/phone beyond what service cards already show. | Code review |
| Accessibility | Dropdowns are labelled native/accessible selects; cards are keyboard-focusable links. | Manual keyboard check |
| Performance | Not applicable: client-side data volume is small. | - |
| Observability | Not applicable: UI-only. | - |
| Rollback | Revert commit; the optional category field is ignored by old code. | - |

## Follow-ups

- Provider id: plan must choose a stable provider id (e.g. encoded provider email key) for the URL.
- Ratings on provider cards once the feedback module ships.

## Change log

- 2026-10-14: spec approved.
