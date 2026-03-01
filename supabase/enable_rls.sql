-- Enable RLS on all app tables (run in Supabase SQL Editor if Dashboard shows "RLS disabled").
-- Policies must already exist (from running the other migration files); this only turns RLS on.

alter table if exists public.detailer_bookings enable row level security;
alter table if exists public.detailers enable row level security;
alter table if exists public.stripe_customers enable row level security;
alter table if exists public.payment_methods enable row level security;
alter table if exists public.detailer_applications enable row level security;
alter table if exists public.booking_messages enable row level security;
alter table if exists public.user_roles enable row level security;
alter table if exists public.admin_users enable row level security;
