# PayMongo setup

Booking deposits and provider subscriptions use PayMongo hosted Checkout Sessions. Amounts are calculated on the server in PHP and sent in centavos. The browser cannot mark a payment as paid. Signed webhooks and the authenticated return page retrieve the checkout from PayMongo before recording payment; repeated confirmations do not extend subscriptions twice.

Set these server-only values in `.env.local` and your deployment environment:

```
PAYMONGO_SECRET_KEY=sk_test_your_key
PAYMONGO_WEBHOOK_SECRET=your_webhook_signing_secret
APP_URL=http://localhost:3000
```

Use your public HTTPS application URL for `APP_URL` in production. Enable QR Ph, GCash, Maya and cards in your PayMongo account as needed. No public API key is required.

Register `https://YOUR_DOMAIN/api/paymongo/webhook` in PayMongo's dashboard for `checkout_session.payment.paid`. Copy that webhook's signing secret into `PAYMONGO_WEBHOOK_SECRET`. Local webhook testing needs a public HTTPS tunnel. Restart the app after changing environment variables.

Start with test credentials. Test payments are labelled `DEMO: PayMongo test` and cannot fund provider withdrawals. Test successful, abandoned, and failed payments, return-page confirmation, duplicate webhook deliveries, and subscription renewal before replacing the credentials with live ones. The live webhook must use its own signing secret.

An unfinished checkout can be resumed from its return URL. Pending bookings, including unpaid checkouts and paid requests awaiting acceptance, do not reserve dates. Only provider-accepted (Confirmed) and Completed bookings block dates. Provider acceptance checks for overlapping accepted bookings atomically. Use Cancel checkout on the return page to expire an unpaid PayMongo session. Refunds and provider withdrawals retain their existing manual processing flow.

References: https://docs.paymongo.com/reference/checkout-session-resource and https://docs.paymongo.com/docs/developer-tools-webhook-setup-management

Wallet selections default to Scan QR code, which creates a `qrph` Checkout Session. PayMongo displays the transaction QR on its hosted checkout; customers scan it with GCash or Maya. Wallet checkout remains available for direct `gcash` or `paymaya` authorization. Cards use `card`. QR payments use the same verified confirmation and receipt flow.
