-- Customer-selected service window. App table: public.detailer_bookings.
alter table public.detailer_bookings
  add column if not exists scheduled_at timestamptz;
