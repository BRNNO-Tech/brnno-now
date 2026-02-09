-- Run this in the Supabase SQL Editor to create the detailer_applications table and RLS.

-- Table: detailer_applications
create table if not exists public.detailer_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now() not null,
  full_name text not null,
  email text not null,
  phone text not null,
  business_name text not null,
  ein text not null,
  business_type text not null,
  dba text,
  business_street text,
  business_city text,
  business_state text,
  business_zip text,
  vehicle_type text,
  service_area text,
  message text,
  user_id uuid references auth.users(id) on delete set null
);

-- RLS: enable
alter table public.detailer_applications enable row level security;

-- Policy: allow insert for authenticated users
create policy "Allow authenticated insert"
  on public.detailer_applications
  for insert
  to authenticated
  with check (true);

-- Policy: allow anon insert (optional – so non-logged-in users can apply)
create policy "Allow anon insert"
  on public.detailer_applications
  for insert
  to anon
  with check (true);

-- Policy: no public read/update/delete (admin via dashboard or service role only)
-- No select/update/delete policies for anon or authenticated; use service role in dashboard to view applications.
