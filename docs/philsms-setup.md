# PhilSMS signup OTP

Signup verifies email through Supabase, then sends a six-digit mobile verification code directly through PhilSMS. Email/password login and Google sign-in remain available. SMS is not a passwordless sign-in option.

## Configuration

### Local demo verification

Set `ENABLE_DEMO_OTP=true` in `.env.local`. On the mobile verification screen, select **Resend code**, then enter **123456**, which is also displayed on the screen. No SMS is sent and no PhilSMS credentials or credits are needed. Email verification still uses the actual Supabase email code.

Demo codes retain the same expiry, attempt limits, fixed mobile number, and resend cooldown. Demo mode is always disabled when `NODE_ENV=production`. Set `ENABLE_DEMO_OTP=false` to restore real delivery; accounts verified only through the demo must then complete real phone verification. Restart the development server if it does not reload the setting automatically.

### Real SMS delivery

The existing Supabase URL, publishable key, and PostgreSQL connection remain required. Configure these server-only PhilSMS values in `.env.local` and your deployment:

```env
PHILSMS_API_TOKEN=your_actual_philsms_api_token
PHILSMS_SENDER_ID=your_approved_sender_id
```

The integration uses https://dashboard.philsms.com/api/v3/ as shown in this account's Developers page. Tokens must be checked against that account endpoint; a rejection from app.philsms.com does not establish that this dashboard token is invalid.

The sender ID must be allowed for your PhilSMS account, and the account needs SMS credits. If the sender is already configured, you only need to add or replace the API token. Never prefix either value with `NEXT_PUBLIC_`.

**No Supabase SMS provider, phone hook, signing secret, or public tunnel is required for this signup flow.** The previous `Unable to get SMS provider` error came from calling Supabase's phone-update API; signup no longer calls it.

Keep Supabase email confirmation enabled, and include `{{ .Token }}` in the email signup template. Apply the private OTP storage once, then check the local configuration:

```powershell
npm.cmd run db:init
npm.cmd run sms:check
```

Restart the app after changing environment variables. The configuration checker prints only whether values are set, not their contents. It does not validate the token remotely or send messages.

## Verification flow

1. Signup records the mobile number in the user's Supabase profile and verifies the email.
2. The authenticated app calls `POST /api/auth/signup-sms` with `{ "action": "send" }`. The server validates the Supabase session and verified email.
3. On the first request, the server pins the signup number in a private database row. Later requests use that row, including after metadata edits. The request cannot supply or replace a phone number.
4. The server generates a random code and sends it through PhilSMS. The UI displays the number as read-only.
5. `POST /api/auth/signup-sms` with `{ "action": "verify", "code": "123456" }` verifies the code for the authenticated account. The example code is not a working OTP.
6. The private verification record unlocks protected application access. Interrupted signups resume this step on the next email/password login.

Codes expire after five minutes. Each code allows five attempts. Resends have a 60-second server-enforced cooldown and a maximum of five sends per phone per hour. Failed deliveries still count toward limits. A replacement code invalidates the previous code, and a successful code cannot be replayed. Only an HMAC digest is stored, using the server-only PhilSMS token as its key; rotating that token invalidates outstanding codes and users must request a new one.

Database rows bind each challenge to its Supabase user and pinned phone. Row-level security and revoked browser-role privileges keep challenge state inaccessible through the Data API. Raw codes, API tokens, and provider responses are not returned to the browser or logged. Network requests occur after committing a send reservation, so an upstream timeout does not keep database locks open.

The mobile number cannot be edited on the OTP screen or changed by passing a phone to the API. If the signup number was wrong, contact support. Profile metadata edits cannot change a number already pinned for verification. Existing Supabase-confirmed phones, trusted administrator accounts, and Google accounts retain their established access behavior.

## Files

| File | Purpose |
| --- | --- |
| `app/api/auth/signup-sms/route.ts` | Authenticated status, send, and verify endpoints. |
| `lib/server/auth/signup-sms.ts` | Fixed phone, code generation, HMAC verification, expiry, rate limits, and PhilSMS delivery. |
| `database/schema.sql` | Private verification table, RLS, and privileges. |
| `lib/auth/client-auth.ts` | Signup and interrupted-signup recovery. |
| `components/auth/otp-form.tsx` | Read-only phone, code entry, resend, and countdown. |
| `lib/server/data-service.ts` | Server-side account access check. |

The old signed `/api/auth/send-sms` endpoint remains for compatibility with any separately configured Supabase hooks. It is not used by this signup flow and needs a hook secret only if used separately.

## Checks and troubleshooting

```powershell
node --test tests/signup-sms.cjs tests/supabase-auth.cjs tests/postgres-schema.cjs
npm.cmd run typecheck
```

Automated tests cover fixed-number enforcement, authentication, cross-account rejection, code expiry, replay prevention, incorrect-attempt limits, send limits, provider failure, and private database permissions. They use mocked SMS delivery and do not send real messages.

| Symptom | Action |
| --- | --- |
| PhilSMS rejects the token | Copy the API token from your PhilSMS dashboard into `PHILSMS_API_TOKEN`, save, and restart. Supabase and Clerk keys do not work here. |
| SMS delivery fails | Check token, approved sender, available credits, and provider availability. Wait for the countdown before retrying. |
| Verification temporarily unavailable | Check the database connection and run `npm.cmd run db:init` on the deployment's database. |
| Code incorrect or expired | Enter the latest SMS code within five minutes. Resend after the countdown. |
| Too many requests | Wait for the server's indicated retry interval. |
| Old SMS-provider error still shown | Reload the updated app and select Resend code. Signup now uses the direct PhilSMS endpoint. |

Live validation requires a phone you control and consumes SMS credits. API acceptance alone does not prove carrier delivery.

References: [PhilSMS API documentation](https://dashboard.philsms.com/developers/documentation), [Supabase server-side user validation](https://supabase.com/docs/reference/javascript/auth-getuser).
