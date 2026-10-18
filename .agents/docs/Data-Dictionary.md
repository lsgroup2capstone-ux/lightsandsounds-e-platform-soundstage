---
tags:
  - project/database
  - data-dictionary
updated: 2026-10-17
---

# Data Dictionary

Related notes: [[Database]] · [[Architecture]]

Every table lives in the private `soundstage` schema (Supabase Table Editor → schema dropdown → `soundstage`). Sources: `database/schema.sql` for real tables, and the TypeScript types named below for JSON records stored in `soundstage.records`.

Conventions: `text` dates are ISO-8601 strings; money is PHP (pesos, `number`, not centavos); emails are stored lowercase. `?` marks an optional field.

## 1. User

### Table `soundstage.profiles` (authoritative user record)

| Column | Type | Null | Rule / description |
| --- | --- | --- | --- |
| `clerk_user_id` | text | No | Primary key; Clerk user id, must start with `user_` |
| `email` | text | No | Unique, lowercase |
| `first_name` | text | No | Default `''` |
| `last_name` | text | No | Default `''` |
| `phone` | text | No | Default `''` |
| `role` | text | No | `client`, `provider`, `payroll_master`, `admin` |
| `status` | text | No | `active` (default), `suspended`, `deactivated` |
| `created_at` | timestamptz | No | Default `now()` |
| `updated_at` | timestamptz | No | Default `now()` |

### Table `soundstage.identities` (legacy Supabase Auth login, used by admins)

| Column | Type | Null | Rule / description |
| --- | --- | --- | --- |
| `auth_id` | uuid | No | Primary key; references `auth.users.id` (delete restricted) |
| `email` | text | No | Unique, lowercase |
| `role` | text | No | `client`, `provider`, `admin` |
| `created_at` | timestamptz | No | Default `now()` |

### Table `soundstage.clerk_identities` (legacy Clerk mapping, kept for rollback)

| Column | Type | Null | Rule / description |
| --- | --- | --- | --- |
| `clerk_id` | text | No | Primary key; starts with `user_` |
| `email` | text | No | Unique, lowercase |
| `role` | text | No | `client`, `provider` |
| `created_at` | timestamptz | No | Default `now()` |

### Table `soundstage.signup_phone_verifications` (server-only OTP state)

| Column | Type | Null | Rule / description |
| --- | --- | --- | --- |
| `auth_id` | uuid | No | Primary key; references `auth.users.id` (cascade delete) |
| `phone` | text | No | Philippine mobile, format `+639XXXXXXXXX` |
| `nonce` | text | No | One-time value tying the code to the request |
| `otp_digest` | text | Yes | Hash of the code, never the code itself |
| `expires_at` | timestamptz | No | Code expiry |
| `sent_at` | timestamptz | No | Last send time |
| `window_started_at` | timestamptz | No | Start of the rate-limit window |
| `send_count` | integer | No | Default 1, must be > 0 |
| `attempts` | integer | No | Default 0, between 0 and 5 |
| `delivered` | boolean | No | Default `false` |
| `verified_at` | timestamptz | Yes | Set when verified |

### JSON record `soundstage-accounts-v2` (array of `ClientAccount`, `lib/server/domain/client-auth.ts`)

| Field | Type | Description |
| --- | --- | --- |
| `firstName`, `lastName` | string | Name |
| `email` | string | Account key, lowercase |
| `mobile` | string | Mobile number |
| `role` | string | `client`, `provider`, `payroll_master`, `admin` |
| `authMethod` | string | `email`, `phone`, `google` |
| `business?` | string | Provider business name |
| `bio?` | string | Provider bio |
| `profileImage?` | string | Stored image key/URL |
| `application?` | object | Provider application: `status` (`Pending`/`Approved`/`Rejected`), `documents[]` (`name`, `type`, `key`, `size`), `submittedAt`, `reviewedAt?`, `reason?` |

## 2. Service Packages

JSON record `soundstage-provider-services-v2:<provider email>`, one row per provider, holding an array of `ProviderService` (`lib/server/domain/provider-services.ts`).

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Package id |
| `name` | string | Package name |
| `category?` | string | `Sound System`, `Lighting`, `Full Production`, `Band & Stage` |
| `description` | string | Description |
| `price` | number | Base price (PHP) |
| `location` | string | Home town |
| `coverageAreas` | string | Towns served without extra fee |
| `transportationFee` | number | Fee per town outside coverage (PHP) |
| `image` | string | Stored image key/URL |
| `providerName` | string | Display name of the provider |
| `active` | boolean | Listed publicly when true |
| `bookings` | number | Booking counter |

## 3. Booking

JSON record `soundstage-client-bookings-v3:<client email>`, one row per client, holding an array of `Booking` (`lib/marketplace/mock-data.ts`).

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Booking id |
| `packageId`, `packageName` | string | Booked package and its name at booking time |
| `provider`, `client` | string | Provider and client names |
| `image` | string | Package image |
| `date`, `time` | string | Event date and time |
| `durationDays?` | number | Number of event days |
| `eventType?` | string | Wedding, fiesta, etc. |
| `location` | string | Venue |
| `eventTown?` | string | Town of the event |
| `townsAway?` | number | Distance outside coverage, in towns |
| `coverageAreas?` | string | Provider coverage at booking time |
| `guests` | number | Guest count |
| `notes` | string | Client notes |
| `basePrice?` | number | Package price (PHP) |
| `transportationFee?` | number | Calculated travel fee (PHP) |
| `total` | number | `basePrice` + `transportationFee` |
| `downpayment` | number | Deposit charged at checkout |
| `status` | string | `Pending`, `Confirmed`, `Cancelled`, `Completed` |
| `paid` | boolean | Deposit paid |
| `paidAt?`, `completedAt?`, `cancelledAt?` | string | Timestamps |
| `cancelledBy?` | string | `client`, `provider`, `admin` |
| `paymentMethod?` | string | Method chosen at checkout |
| `refund?` | object | See Payment → Refund |
| `feedback?` | object | See Feedback |

## 4. Schedule

JSON record `soundstage-schedule:<provider email>`: an array of blocked dates (`string`, `YYYY-MM-DD`). Bookings on a blocked date are rejected by `lib/server/data-service.ts`.

## 5. Payment

### JSON record `soundstage-payment:<id>` (PayMongo checkout, `PaymentRecord` in `lib/server/data-service.ts`)

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Internal payment id; sent to PayMongo as the reference number |
| `email` | string | Payer email |
| `amount` | number | Amount (PHP) |
| `kind` | string | `booking` or `subscription` |
| `plan?` | string | Subscription plan name |
| `sessionId` | string | PayMongo checkout session id |
| `checkoutUrl` | string | `https://checkout.paymongo.com/...` |
| `paid?`, `cancelled?` | boolean | Settlement state |

### Refund (nested in `Booking.refund`)

| Field | Type | Description |
| --- | --- | --- |
| `status` | string | `Pending`, `Paid`, `Rejected` |
| `amount` | number | Refund amount (PHP) |
| `method`, `account` | string | Where the refund is sent |
| `requestedAt`, `processedAt?` | string | Timestamps |
| `reference?` | string | Transfer reference |
| `reason?` | string | Rejection or request reason |

### JSON record `soundstage-withdrawals-v1` (array of `WithdrawalRequest`, legacy provider payouts)

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Request id |
| `provider`, `providerEmail` | string | Requesting provider |
| `amount` | number | Amount (PHP) |
| `payoutMethod`, `payoutAccount` | string | Destination |
| `status` | string | `Pending`, `Paid`, `Rejected` |
| `requestedAt`, `processedAt?` | string | Timestamps |

## 6. Feedback

Nested in `Booking.feedback`. Public averages (`soundstage-service-ratings-v1`) are computed from this and not stored as a source of truth.

| Field | Type | Description |
| --- | --- | --- |
| `rating` | number | Star rating |
| `comment` | string | Review text |
| `createdAt` | string | Timestamp |

## 7. Subscription

JSON record `soundstage-marketplace-v1`, one object `{ subscriptions[], payments[], audit[] }` (`lib/server/domain/marketplace-billing.ts`). Plans: Starter PHP 499, Pro PHP 999, Studio PHP 1,999 per 30 days.

### `subscriptions[]`

| Field | Type | Description |
| --- | --- | --- |
| `email` | string | Provider email |
| `trialStart`, `trialEnd` | string | Free trial window |
| `plan?` | string | Current plan name |
| `paidUntil?` | string | Paid-through date |

### `payments[]` (subscription payments)

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Payment id |
| `email`, `customer` | string | Provider email and business/name |
| `plan` | string | Plan paid for |
| `amount` | number | Amount (PHP) |
| `method`, `reference` | string | Payment method and its reference number |
| `status` | string | `Pending`, `Paid`, `Rejected` |
| `createdAt`, `paidAt?` | string | Timestamps |
| `invoice?` | string | Invoice number |

### `audit[]`

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Entry id |
| `actor` | string | Who acted |
| `action`, `target` | string | What was done, to which record |
| `before`, `after` | string | Value change |
| `at` | string | Timestamp |

## 8. Other data found (not in the original seven)

### Booking messages: `soundstage-booking-messages-v1` (array of `BookingMessage`)

| Field | Type | Description |
| --- | --- | --- |
| `id`, `bookingId` | string | Message and its booking |
| `client`, `provider` | string | Participants |
| `senderRole` | string | `client` or `provider` |
| `senderName`, `body` | string | Sender and text |
| `createdAt` | string | Timestamp |

### Reports / disputes: `soundstage-provider-reports-v1` (array of `ProviderReport`)

| Field | Type | Description |
| --- | --- | --- |
| `id`, `bookingId` | string | Report and its booking |
| `client`, `clientEmail`, `provider` | string | Parties |
| `reason`, `details` | string | Complaint |
| `status` | string | `Pending` or `Resolved` |
| `createdAt` | string | Timestamp |

### Notification read markers: `soundstage-event-notifications:<role>:<email>`

Array of notification ids the user has read.

### Table `soundstage.schema_versions`

| Column | Type | Description |
| --- | --- | --- |
| `version` | integer | Primary key; applied schema version (currently 1–4) |
| `applied_at` | timestamptz | Default `now()` |

## Coverage by planned relational tables

| Current data | Planned table(s) | Plan status |
| --- | --- | --- |
| Booking | `bookings`, `booking_status_history`, `reschedule_requests`, `cancellation_requests` | Plan approved (booking plan 1) |
| Schedule | `availability_schedules` | Plan approved (booking plan 1) |
| Booking payments | `payments`, `payment_events` | Plan approved (payments plan 1) |
| Refund | `refunds`, `refund_status_history`, `refund_attachments` | Spec only |
| Withdrawals | `provider_payouts`, `payout_items`, … | Spec only |
| Feedback | `booking_feedback` | Spec only |
| Notification markers | `notifications`, `notification_deliveries` | Spec only |
| Audit | `audit_log` | Spec only |
| User | `profiles` | Exists |
| **Service Packages** | none | **No spec**; booking spec lists it out of scope |
| **Subscription** + subscription payments | none | **No spec** |
| **Booking messages** | none | **No spec** |
| **Reports / disputes** | none | **No spec** |
