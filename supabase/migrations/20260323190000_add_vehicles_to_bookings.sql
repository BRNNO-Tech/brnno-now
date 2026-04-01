alter table public.detailer_bookings
  add column if not exists vehicles jsonb;
