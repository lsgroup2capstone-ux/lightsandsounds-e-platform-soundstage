# Pending manual checks (saved 2026-10-17)

State: payments plan 2, booking plans 4 and 5 are **approved, not shipped**. All of it is uncommitted. Ship in this order with `/sdd-ship`: payments 2 → booking 4 → booking 5.

## 1. Real webhook secret (test mode)

`.env.local` `PAYMONGO_WEBHOOK_SECRET` is a one-character placeholder. Until it is replaced, payments never confirm, because the webhook signature fails.

1. Run `npm run dev`. In a second terminal, run `npx cloudflared tunnel --url http://localhost:3000` (or `ngrok http 3000`) and copy the https URL.
2. Create the webhook with the test key:
   ```powershell
   $key = "sk_test_..."
   $auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${key}:"))
   $body = '{"data":{"attributes":{"url":"https://<tunnel>/api/webhooks/paymongo","events":["checkout_session.payment.paid","payment.failed"]}}}'
   Invoke-RestMethod -Method Post -Uri https://api.paymongo.com/v1/webhooks -Headers @{Authorization="Basic $auth"} -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 5
   ```
3. Copy `secret_key` (`whsk_...`) into `.env.local` as `PAYMONGO_WEBHOOK_SECRET`, then restart `npm run dev`.
4. Test the flow:
   1. The client books.
   2. The provider accepts.
   3. The client chooses "Pay 30% downpayment" and pays on the test checkout.
   4. The return page shows "processing", then "confirmed", and the booking shows Confirmed.
   5. Repeat with a provider subscription payment.
5. Rerun the bundle check: build, then grep `.next/static` for the real secret value. Expect no match.

A new tunnel URL needs a new webhook. List webhooks with `GET https://api.paymongo.com/v1/webhooks`.

**Database warning:** `SUPABASE_DB_URL` in `.env.local` points at a non-local database. Test bookings and payments will be written there. Either accept that or switch to a local Postgres first.

## 2. Option without a tunnel (not built yet)

Set `PAYMONGO_WEBHOOK_SECRET` to any random value, pay a test checkout, then send `localhost` a signed fake `checkout_session.payment.paid` event. Ask Claude to write the script. This proves the local flow only, not PayMongo's delivery.

## 3. Other manual checks

- The return page `/payment/return`: screen reader and keyboard only.
- Booking click-through: book → accept → pay → confirmed → start → complete → feedback, plus provider decline and cancel with reasons.
- Migration: run `npm run bookings:migrate` (a dry run) against a **local** database, review the `unmappable` and `conflicts` lists, then run `-- --execute`. A shared or production database needs explicit approval.

## 4. Optional

- `docs/paymongo.md` is out of date: it names the old webhook URL, lists only one event, and describes the removed return-page check. Claude offered to update it.
- Lint can't run (there is no `eslint.config.*`).
