-- Tax withholding: store tax and subtotal for records and payout math.
-- cost = total (subtotal + tax); detailer payout = f(subtotal), never include tax.

alter table public.detailer_bookings
  add column if not exists tax_cents integer,
  add column if not exists subtotal_cents integer;

select 1;
