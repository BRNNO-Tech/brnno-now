-- Store final tip (cents) for the booking; set by charge-tip-for-booking Edge Function.

alter table public.detailer_bookings
  add column if not exists tip_amount integer default 0;

select 1;
