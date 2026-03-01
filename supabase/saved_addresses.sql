-- Run in Supabase SQL Editor. Saved addresses for logged-in customers (address step in booking flow).

create table if not exists public.saved_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  address text not null,
  address_zip text,
  lat double precision,
  lng double precision,
  created_at timestamptz default now() not null
);

create index if not exists idx_saved_addresses_user_id on public.saved_addresses(user_id);

alter table public.saved_addresses enable row level security;

create policy "Users can manage own saved_addresses"
  on public.saved_addresses for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
