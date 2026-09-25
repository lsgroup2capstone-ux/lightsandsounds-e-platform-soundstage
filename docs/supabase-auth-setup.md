> Historical migration: client/provider login has been restored to Clerk. Use [Clerk setup](clerk-google-setup.md) for the current configuration. The Supabase Auth copies created during this migration were preserved.

# Supabase authentication

Supabase Auth now handles client, provider and administrator email/password login, signup, verification and password recovery. Google sign-in also uses Supabase. Clerk sessions are no longer accepted by the application, and the old Clerk routes redirect to login.

## Project settings

- Enable Email authentication and Confirm email in Supabase Authentication settings.
- Set Site URL and allowed redirect URLs for each application origin, including `/auth/callback` and `/auth/callback?flow=reset`.
- Configure custom SMTP for delivery to real users. Supabase's default mail service restricts recipients and volume. Set confirmation and recovery templates to include `{{ .Token }}` and use six-digit email OTPs. The callback also supports Supabase's default confirmation and recovery links.
- Alternatively, the existing signed `/api/auth/send-email` hook can deliver six-digit codes when its server SMTP credentials and Supabase hook secret are configured. No email credentials are sent to browsers.
- Enable Google and configure its OAuth credentials in Supabase to use Google sign-in. The checked project currently has Google disabled; Google buttons remain hidden until you also set `NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED=true` and restart the app.
- Email ownership is required; the mobile number remains a contact field, matching the former Clerk signup flow. Provider document review is unchanged.

## Existing Clerk accounts

Run `node scripts/migrate-clerk-to-supabase.cjs` for a read-only preflight, then add `--execute` to migrate. The script verifies each Clerk primary email and saved role before creating Supabase Auth accounts, uses the Auth Admin API, and links the new IDs to `soundstage.identities`. It is safe to rerun after a partial failure and refuses conflicting or administrator identities.

The migration does not send emails or copy passwords. Migrated users must use **Forgot password** with their existing email to set a Supabase password, or sign in with Google once that provider is configured. Existing Supabase users keep their passwords.

Profiles, documents, bookings, messages and billing records remain in `soundstage.records`. Clerk records and mappings are retained for migration audit; they no longer provide application access. Administrator authentication is unchanged.

Check migrated users under **Supabase → Authentication → Users** and role mappings under **Table Editor → soundstage → identities**.

References: [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords), [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
