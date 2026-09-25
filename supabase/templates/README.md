# Password reset email

For app-managed Gmail delivery, follow [Gmail OTP setup](../../docs/gmail-email-otp.md).
The template below applies only when the Send Email hook is disabled.

Both clients and service providers recover their account using their registered email:
`/forgot-password` → `/verify-otp?flow=reset` → `/reset-password` → login.

In the hosted Supabase project's Authentication → Email Templates → Reset Password,
set the subject to `Reset your SoundStage password` and paste `recovery.html` as the
email body. The `{{ .Token }}` variable is required: the default link-only template
does not display the code requested by this application's OTP screen.

Save the template in the Supabase dashboard; editing this local HTML file does
not update the hosted email. Replace the entire existing body so it contains no
`{{ .ConfirmationURL }}` reset link. Request a fresh code after saving.

Configure a production SMTP provider in Authentication → Email → SMTP Settings
to deliver to registered users outside the Supabase project team. Keep the email
OTP length set to 6 to match the application's verification screen. Supabase
enforces code expiry, single use, and email rate limits.

Verify delivery using a client and provider account you control: request a reset,
enter the emailed code, save a new password, and sign in with that password.
Check invalid/expired codes, resend, and rejected passwords as well.

Reference: https://supabase.com/docs/guides/auth/auth-email-templates
