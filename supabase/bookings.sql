-- Run this in the Supabase SQL Editor to create the detailer_bookings table and RLS.
-- Stores customer booking history (one row per booking). Separate from marketplace_bookings.

create table if not exists public.detailer_bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service_name text not null,
  cost numeric not null,
  status text not null check (status in ('en_route', 'completed', 'cancelled')),
  detailer_name text not null,
  car_name text not null,
  location text,
  completed_at timestamptz,
  created_at timestamptz default now() not null
);

create index if not exists idx_detailer_bookings_user_id on public.detailer_bookings(user_id);

alter table public.detailer_bookings enable row level security;

create policy "Users can select own detailer_bookings"
  on public.detailer_bookings for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own detailer_bookings"
  on public.detailer_bookings for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own detailer_bookings"
  on public.detailer_bookings for update to authenticated
  using (auth.uid() = user_id);
