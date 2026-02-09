# Edge Functions (Stripe payments)

## Setup Intent vs Payment Intent

| Function | Purpose | Stripe Dashboard | Amount |
|----------|---------|------------------|--------|
| **create-setup-intent** | Save a card for later (Profile → Wallet & Pay → Add card) | Setup Intents / API logs; **not** in Payments tab | No charge — $0 |
| **create-payment-intent** | Authorize (hold) funds for a booking (Pay & Book; capture_method manual) | **Payments** tab (Uncaptured until capture) | Hold — e.g. $285 |
| **capture-payment** | Capture the hold when the detailer accepts the job | — | Collects the authorized amount |
| **cancel-payment** | Cancel (void) the hold when the user cancels or no one accepts | — | Releases the hold; no refund needed |

**Authorization and capture (Uber-style):** create-payment-intent authorizes the card (user sees a pending charge). When the detailer is assigned, the app calls capture-payment to collect the money. If the user cancels before that, the app calls cancel-payment to release the hold.

Setup Intents do **not** show dollar amounts because they never charge; they only attach a payment method to a customer. If “create_setup_intent stopped working,” check: (1) Add card in Profile still works; (2) Stripe Dashboard → Developers → Logs for `SetupIntents.create`; (3) Stripe Dashboard → Customers to see new payment methods attached.

## Prerequisites

1. **Database**: Run [../payment_methods.sql](../payment_methods.sql) in the Supabase SQL Editor once. It creates `stripe_customers` and `payment_methods` (required by these functions).

2. **Secrets**: In Supabase Dashboard → Project Settings → Edge Functions → Secrets, add:
   - `STRIPE_SECRET_KEY` = your Stripe secret key (e.g. `sk_test_...` for test mode).

3. **Deploy**: From the project root:
   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy create-setup-intent
   supabase functions deploy create-payment-intent
   supabase functions deploy save-payment-method
   supabase functions deploy capture-payment
   supabase functions deploy cancel-payment
   ```
   Replace `YOUR_PROJECT_REF` with the ref from your Supabase URL (e.g. `ozgccawuniacwglapzww`).

## CORS / preflight

`supabase/config.toml` sets `verify_jwt = false` for these five functions so the **OPTIONS preflight** (sent by the browser before POST) reaches the function. The gateway would otherwise require a JWT and return 401 for OPTIONS (no CORS headers), which shows up as a CORS error. The functions still validate the JWT for POST requests inside the handler.

After changing `config.toml`, redeploy the functions so the setting takes effect.

## If you still see CORS or 401 errors

- **CORS on create-setup-intent**: (1) Ensure the functions are deployed (see Deploy above). (2) Ensure `supabase/config.toml` exists with `verify_jwt = false` for each function, then redeploy.
- **401 Unauthorized**: Ensure you’re logged in when adding a card or paying. The app now sends the session token explicitly.
- **Stripe 401 on merchant-ui-api.stripe.com**: That’s Stripe’s wallet config; often safe to ignore if add-card and payment work. Use a valid test publishable key in `.env.local` (`VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...`) for test mode.
