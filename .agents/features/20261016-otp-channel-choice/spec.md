---
artifact: spec
schema: 1
feature: 20261016-otp-channel-choice
revision: 1
status: spec-approved
risk: high-risk
---

# OTP channel choice (email or SMS)

- Feature id: 20261016-otp-channel-choice
- Revision: 1
- Status: spec-approved
- Risk lane: high-risk
- Approved by: user, 2026-10-16
- Related decisions: none

## Problem

Users can only receive one-time codes by email. Users without reliable email
access cannot finish signup or reset their password. A PhilSMS sender already
exists but is not wired into the current Clerk signup or reset flows.

Facts found in the code:

- Signup creates a Clerk sign-up and sends an email code only
  (`lib/auth/client-auth.ts:18-20`); mobile is stored in `unsafeMetadata`, unverified.
- Signup verification uses `attemptEmailAddressVerification`
  (`lib/auth/client-auth.ts:25-43`); resend is email-only (`:44-48`).
- Login second factor uses Clerk `email_code` only (`lib/auth/client-auth.ts:63-73`).
- Password reset is email-only (`components/auth/forgot-password-form.tsx:24`,
  `components/auth/otp-form.tsx:83`).
- OTP screen copy is email-specific (`components/auth/otp-form.tsx:99-100`).
- PhilSMS OTP module with HMAC-digested codes, 5-minute expiry, 5 attempts,
  60 s cooldown, 5 sends/hour, phone pinning: `lib/server/auth/signup-sms.ts`,
  route `app/api/auth/signup-sms/route.ts`, docs `docs/philsms-setup.md`,
  tests `tests/auth/signup-sms.cjs`. It currently authenticates a Supabase session.
- Phone normalization: `lib/auth/phone.ts` (`normalizePhilippineMobile`).

## Decisions

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | Which flows offer the choice? | Signup and password reset. Login 2FA stays email. | Clerk SMS needs a paid plan and can't use PhilSMS; we can use our own sender for signup and reset. |
| D2 | How does SMS signup work given Clerk wants email? | If SMS is chosen, the phone is verified through PhilSMS and the account is created without a verified email. | Reuses the existing PhilSMS module; marks the account phone-verified. |
| D3 | Which number gets a reset SMS? | Only a phone already verified on the account. | Sending to an unverified number risks account takeover. |
| D4 | Where does the user choose? | An Email/SMS toggle on the signup and forgot-password forms, before sending. | Clear choice up front. |
| D5 | What happens when SMS fails? | Show the error plus a "Send by email instead" action. | Users are never stuck. |

Prerequisite: the Clerk instance must allow sign-up completion without a
verified email (email verification optional). This is a dashboard setting
outside the repo. If it can't be changed, the SMS signup path (D2) is blocked
and the planner must stop and report it.

## Out of scope

- SMS for login 2FA: Clerk SMS cost and provider limits (D1).
- Changing or verifying a phone number after signup: separate profile feature.
- Non-Philippine mobile numbers: `normalizePhilippineMobile` limits these today.
- Voice calls, WhatsApp, or authenticator apps.

## Acceptance criteria

- AC1: THE SYSTEM SHALL show an Email/SMS channel toggle on the signup form, defaulting to Email.
- AC2: WHEN a user signs up with Email selected, THE SYSTEM SHALL behave as it does today (Clerk email code).
- AC3: WHEN a user signs up with SMS selected, THE SYSTEM SHALL send a 6-digit code to the signup mobile through PhilSMS and SHALL NOT send an email code.
- AC4: WHEN a correct SMS code is entered at signup, THE SYSTEM SHALL complete the account, sign the user in, and record the phone as verified.
- AC5: IF an SMS code is wrong, expired, or past 5 attempts, THEN THE SYSTEM SHALL reject it with "That code is incorrect or expired." and SHALL NOT create a session.
- AC6: IF an SMS resend comes within 60 s or exceeds 5 sends per hour, THEN THE SYSTEM SHALL refuse it with the retry wait shown, and the server SHALL enforce it whatever the client sends.
- AC7: THE SYSTEM SHALL take the SMS recipient only from server-held account data and SHALL NOT accept a phone number from the verify/send request.
- AC8: WHEN the OTP screen is shown, THE SYSTEM SHALL name the chosen channel (masked email or masked phone, e.g. `+63 9** *** 1234`).
- AC9: WHEN a user requests a password reset for an account with a verified phone, THE SYSTEM SHALL offer the Email/SMS toggle; otherwise THE SYSTEM SHALL offer email only.
- AC10: WHEN a reset is requested with SMS, THE SYSTEM SHALL send the code only to the account's verified phone, and a correct code SHALL allow setting a new password that meets the password policy.
- AC11: IF a reset is requested for an unknown email, or SMS is requested for an account without a verified phone, THEN THE SYSTEM SHALL return the same generic response as a successful request (no account or phone enumeration).
- AC12: IF PhilSMS delivery fails or is not configured, THEN THE SYSTEM SHALL show an error and a "Send by email instead" action that switches to the email flow.
- AC13: THE SYSTEM SHALL never return raw codes, API tokens, or provider responses to the browser or logs.
- AC14: Login second-factor codes SHALL remain email-only and unchanged.

## Non-functional and operational checks

| Area | Requirement or `not applicable` with reason | Evidence |
| --- | --- | --- |
| Security | Server-side rate limits, HMAC-only code storage, phone pinned server-side, no enumeration (AC6, AC7, AC11, AC13) | Unit tests extending `tests/auth/signup-sms.cjs`; review |
| Privacy | Phone masked in UI; no phone/code in logs | Manual check plus test |
| Accessibility | The toggle is a labelled radio group usable from the keyboard; the error is announced (`role="alert"`) | Manual keyboard check |
| Performance | PhilSMS call timeout ≤ 4 s, as today | Code review |
| Observability | Delivery failures counted, without codes or numbers | Review |
| Rollback | Hide the SMS option behind env `ENABLE_SMS_OTP`; unset = email only | Manual toggle check |

## Follow-ups

- SMS for login 2FA if the team moves to a Clerk plan with SMS.
- A flow for users to add or verify a phone later, which would unlock SMS reset for existing users.
- Update `docs/philsms-setup.md` for the Clerk-based flow.

## Change log

- 2026-10-16: spec approved.
