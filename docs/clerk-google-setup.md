# Clerk authentication setup

Clerk handles client/provider email/password signup, email verification, login, password recovery and Google sign-in. Supabase remains the application database and administrator authentication provider. Client/provider signup now verifies email with Clerk; mobile is a contact field, not a verified phone number.

## Required Clerk settings

In the [Clerk Dashboard](https://dashboard.clerk.com/), enable email addresses, sign-up/sign-in with email and password, and **Email verification code** for signup verification. Keep Google enabled if you use Google sign-in. Enable first and last name fields for the custom signup form. Do not require username or phone for this email signup flow. Additional verification requirements are handed to Clerk's supplied screens.

Set these in `.env.local`, then restart Next.js:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_key
CLERK_SECRET_KEY=sk_test_your_key
CLERK_AUTHORIZED_PARTIES=http://localhost:3000
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/auth/clerk/continue
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/auth/clerk/signup
```

Use your actual port in authorized parties. Production requires production Clerk keys and the deployed origin. Keep the secret key server-only. Clerk sends the OTP emails; the legacy Supabase Gmail hook and PhilSMS settings do not control these messages. Clerk bot protection uses the captcha container in the signup form.

## Unverified signups

Submitting the signup form starts a Clerk sign-up attempt (`savePendingAccount` in `lib/auth/client-auth.ts`) so Clerk can send the email code. Clerk only creates a User once the code is verified, and unfinished attempts expire on Clerk's side. No `soundstage.profiles` row is created either, because the server only accepts sessions with a verified email (`authenticate` in `lib/server/data-service.ts`). An abandoned signup therefore leaves no user in Clerk or Supabase.

## Existing accounts

Existing Supabase passwords are not imported into Clerk. Email/password login automatically tries Supabase when Clerk cannot find the account or rejects its password, then loads the saved server profile role. Existing clients and providers can keep using their original credentials. To move to Clerk, sign up with the **same email address**, choose a password, and verify email ownership (or use Google with the same verified email). The existing server-side identity mapping retains the application profile, role, bookings and provider application. Selecting another role does not overwrite an existing profile's role. Password reset works after that email is registered in Clerk; it cannot reset a Supabase-only password.

No account records are deleted or bulk migrated. Existing Supabase sessions remain subject to their existing server checks. Administrator accounts continue using Supabase through the unified sign-in form; Clerk cannot grant administrator access. Existing administrator provisioning and password management remain separate.

The existing `soundstage.clerk_identities` table is required. On a database that has not had the existing schema initialized, run `npm run db:init` according to the database setup instructions. This change introduces no new database schema.

## Verification

1. Sign up as a client, enter the email OTP, and confirm the client profile loads.
2. Sign up as a provider with documents, enter the email OTP, and confirm the application is submitted for review.
3. Sign out, then sign in using email and password. If Clerk requests MFA or device verification, complete its supplied screen.
4. Select **Forgot password**, enter the registered email, verify the six-digit code, and set a matching new password. Confirm the success message, then log in with the new password. Other Clerk sessions are revoked.
5. Test an incorrect/expired code, resend, password mismatch, and opening reset-password without verifying a code.
6. Register an existing account's email in Clerk and verify that its role and records are preserved. Verify administrator sign-in separately.

Automated tests cover Clerk session validation, signup and provider documents, password login, reset attempt binding/resends/reuse, and existing database identity linking. Live email delivery still needs a configured Clerk instance and access to the recipient inbox.

References: [Clerk email/password flows](https://clerk.com/docs/guides/development/custom-flows/authentication/legacy/email-password), [Clerk password recovery](https://clerk.com/docs/guides/development/custom-flows/authentication/legacy/forgot-password).

## Restored Clerk setup

Client/provider authentication has been restored to Clerk. The original Clerk accounts and passwords were retained during the temporary Supabase migration and remain usable. Supabase Auth copies are retained; restoring Clerk does not delete accounts or application records. No Supabase password reset is required to use an existing Clerk password. Google buttons use Clerk configuration again.
