-- Store Stripe PaymentIntent id on booking for tiered cancellation (partial capture or cancel).
alter table public.detailer_bookings
  add column if not exists payment_intent_id text;
