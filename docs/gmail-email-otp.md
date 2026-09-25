# Send OTP emails through the app using Gmail

The app's `/api/auth/send-email` route sends real 6-digit codes through Gmail.
The Gmail host (`smtp.gmail.com`), TLS port (`465`), sender name, and email text
are defined in the route. Credentials stay in server-only environment variables.
Supabase still generates, expires, and verifies codes and updates passwords.
There is no fixed/demo reset code and no password reset link in these emails.

## Setup

1. Enable Google 2-Step Verification on your sender account and create a Google
   App Password: https://myaccount.google.com/apppasswords
2. Add these values to `.env.local` and your hosting environment:

   ```dotenv
   GMAIL_SMTP_USER=your-sender@gmail.com
   GMAIL_SMTP_APP_PASSWORD=your-google-app-password
   SUPABASE_SEND_EMAIL_HOOK_SECRET=your-hook-secret
   ```

3. Deploy the app to a public HTTPS address. In Supabase Authentication → Hooks,
   enable **Send Email**, select HTTP, and enter
   `https://YOUR-APP/api/auth/send-email`. Generate the hook signing secret and
   copy it into `SUPABASE_SEND_EMAIL_HOOK_SECRET` (the `v1,whsec_...` form works).
   Restart/redeploy the app with these environment variables.
   Supabase cannot call a localhost URL; local testing needs a public HTTPS tunnel.
4. Keep the Supabase Email provider enabled and set email OTP length to **6**.
   The hook replaces Supabase SMTP delivery for authentication emails. It handles
   signup, recovery, magic-link OTP, invitations, reauthentication, and email change.
   This application uses signup and recovery OTP screens. Other flows require their
   corresponding OTP verification UI before enabling them for users.
   Security notification email actions are not implemented by this hook; leave
   optional Auth security notification emails disabled until those are supported.
5. Request a reset for a registered client or provider email, check the inbox,
   verify its code, set a new password, and sign in. Check invalid codes and resend.

The hook must be enabled for the app to send email; local code changes alone do
not change hosted delivery. The dashboard recovery template is unused while this
hook is enabled. To roll back, disable the hook and restore working Supabase SMTP.

No credentials or OTPs are logged or returned to the browser. Unsigned and stale
hook requests are rejected. Supabase's Auth endpoint retains its rate limits.

Reference: https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
