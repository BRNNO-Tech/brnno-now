-- Add add-ons and dirtiness/condition to detailer_bookings for detailer visibility.

alter table public.detailer_bookings
  add column if not exists add_ons text[],
  add column if not exists dirtiness_level text;

select 1;
