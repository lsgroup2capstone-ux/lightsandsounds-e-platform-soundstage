> Current authentication: clients and providers use Clerk; administrators use Supabase. See [Clerk setup](../docs/clerk-google-setup.md). Older Supabase-only signup instructions below are historical.

# SoundStage ? Supabase PostgreSQL

The app now uses Supabase Auth and an authenticated Next.js API backed by PostgreSQL. Business records are no longer read from or written to browser localStorage. The browser holds an in-memory snapshot of records the signed-in user is allowed to see. Supabase itself persists its authentication session; unfinished email verification temporarily keeps pending document uploads in sessionStorage.

## Finish setup

1. In Supabase, open **Connect ? Session pooler**. Copy the PostgreSQL URL and replace the password placeholder with your URL-encoded database password. Keep the existing project URL and publishable key in .env.local, and add:

   ~~~dotenv
   SUPABASE_DB_URL=postgresql://postgres.PROJECT_REF:PASSWORD@POOLER_HOST:5432/postgres
   ENABLE_DEMO_PAYMENTS=false
   ~~~

   This server-only connection string is different from NEXT_PUBLIC_SUPABASE_URL. Never give it a NEXT_PUBLIC_ prefix. The URL, publishable key, and database connection must point to the same Supabase project. TLS certificate verification is enabled. If your project requires a private CA, put its PEM certificate in SUPABASE_DB_CA; escaped newlines are supported.

2. Apply and verify the schema, then restart the app:

   ~~~powershell
   npm.cmd run db:init
   npm.cmd run db:check
   npm.cmd run dev
   ~~~

   Alternatively paste database/schema.sql into the Supabase SQL Editor and run it as the database owner. The app still needs SUPABASE_DB_URL for runtime queries. The migration is repeatable and does not drop or truncate records.

3. In **Authentication ? URL Configuration**, configure your site URL and allow these development redirects, plus their deployed equivalents:
   - http://localhost:3000/auth/callback
   - http://localhost:3000/reset-password

4. Enable email/password authentication. The existing verification screens use a six-digit email OTP. Configure the **Confirm signup** and **Reset password** email templates to include the OTP:

   ~~~html
   <h2>Your SoundStage verification code</h2>
   <p>{{ .Token }}</p>
   ~~~

   Configure SMTP delivery in Supabase for production. The previous Resend endpoint and browser-generated reset hashes are retired. The previous fixed SMS code no longer works.

5. For Google sign-in, enable Google under Supabase Auth providers and configure its client credentials and authorized Supabase callback URL. The old NEXT_PUBLIC_GOOGLE_CLIENT_ID is no longer used. A new Google account uses the role selected on signup; administrator privileges cannot be requested by a client.

## First administrator

Register and verify a new email through the app, then run:

~~~powershell
npm.cmd run db:admin -- admin@example.com
~~~

Sign out and sign in again. This command promotes an existing verified Supabase Auth user by setting trusted app_metadata.role. Browser profile metadata cannot grant admin access. ADMIN_EMAIL and ADMIN_PASSWORD from the old app are no longer login credentials. Do not reuse the former demo/admin passwords.

## Existing browser data

After setting up the administrator, use **Import browser data** in the admin workspace on the original browser and site origin (including the same port). The importer shows a confirmation, requires an otherwise empty app database, runs transactionally, refuses repeated imports, and keeps browser originals intact. It imports accounts, provider applications and documents, services, bookings and nested feedback/refunds, billing and audit history, messages, reports, and withdrawals.

Plaintext passwords, tokens, sessions, reset state, and old administrator credentials are excluded. Imported users must register with the same email and verify it through Supabase; their imported profile and role will then be linked to their authenticated identity. Supabase uses one identity per email, so duplicate client/provider emails must be resolved before importing. Imported booking payments are marked as demo payments and cannot generate withdrawable funds.

If you want a clean start, skip the import. This migration does not automatically copy records from a SQL Server instance. The previous app did not use SQL Server for its screens; its old proposed schema is preserved in database/legacy/sql-server.sql for reference.

## Storage and authorization

The private **soundstage** schema contains:

- identities: verified Supabase user IDs, canonical emails, and fixed application roles; linked to auth.users.
- clerk_identities: verified Clerk Google users mapped to non-admin application accounts. See [Clerk setup](../docs/clerk-google-setup.md).
- records: JSONB collections preserving the app's existing nested record format and owner keys.
- schema_versions: applied migration versions.

Select the soundstage schema in the Supabase Table Editor to inspect the tables. It is deliberately excluded from direct browser access: schema/table privileges are revoked from anon and authenticated, and RLS is enabled without permissive policies. The server database connection owns these tables and is privileged, so it must remain private. Browser requests send a Supabase access token; /api/data verifies it with Auth before executing a named, allowlisted operation. Public responses contain approved provider listings and limited provider profiles, not documents, client bookings, messages, or billing records. Provider contact email is included as the current listing identity key.

Every write rechecks account role and ownership on the server. Booking totals are calculated from stored service prices and shared transportation rules. Transactions and a transaction-scoped advisory lock serialize conflicting dates, approvals, and balance changes. Mutations return an updated authorized snapshot only after committing. Tabs refresh on focus and every 30 seconds; Supabase Realtime is not configured.

This compatibility migration uses JSONB collections rather than the unused 16-table SQL Server design. It reads the collection set per request and serializes writes, suitable for the current small application. A larger deployment should move to indexed per-entity tables and narrower queries. Uploaded documents currently remain inline with private application records, with the existing 1 MB limit; Supabase Storage is not required.

## Payments and operational changes

The existing checkout is a simulation, not a payment gateway. Set ENABLE_DEMO_PAYMENTS=true only for demonstrations to retain that flow. Demo booking payments are labeled and cannot be withdrawn. With it false, simulated booking/subscription checkout is rejected; manual subscription submissions and administrator review remain available through the API. Integrate a real processor with verified webhooks before accepting real payments. This migration does not charge money or release payouts.

Provider schedule blocks and notification read markers now persist in PostgreSQL. Profile email fields are read-only because changing an identity email requires a coordinated verified migration of the existing email-keyed records. The old destructive browser reset is disabled; the admin toolbar now offers import instead. The old admin-login and reset-password API routes return 410 rather than issuing unverified sessions.

## Verification

~~~powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
~~~

Tests execute the schema against embedded PostgreSQL, repeat migrations, verify access denial, run complete server workflows against PostgreSQL, check transaction rollback and concurrent booking conflicts, and exercise the existing approvals, billing, refunds, and activity behavior. They do not send real email or create cloud users. Run db:check after supplying the real connection string to verify the hosted project.

References: [Database connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Auth email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google).
