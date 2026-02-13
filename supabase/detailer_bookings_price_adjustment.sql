-- Price adjustment columns and pending_approval status.
-- Run in Supabase SQL Editor.

alter table public.detailer_bookings
  add column if not exists price_adjustment_requested boolean default false,
  add column if not exists adjusted_price integer,
  add column if not exists adjustment_reason text,
  add column if not exists customer_approved_adjustment boolean,
  add column if not exists cancellation_fee_charged boolean default false;

alter table public.detailer_bookings drop constraint if exists detailer_bookings_status_check;
alter table public.detailer_bookings
  add constraint detailer_bookings_status_check
  check (status in ('pending', 'assigned', 'en_route', 'in_progress', 'completed', 'cancelled', 'pending_approval'));
