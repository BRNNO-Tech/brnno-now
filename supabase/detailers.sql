-- Run after detailer_applications and auth exist.
-- Creates detailers table (approved detailers only). Beta detailers inserted via dashboard/SQL.

create table if not exists public.detailers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.detailer_applications(id) on delete set null,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text not null,
  name text not null,
  phone text not null,
  profile_photo_url text,

  service_areas jsonb,
  vehicle_make text,
  vehicle_model text,
  vehicle_year integer,
  vehicle_color text,

  is_online boolean default false,
  is_approved boolean default true,
  status text not null default 'active' check (status in ('active', 'suspended', 'deactivated')),

  stripe_connect_account_id text,
  stripe_connect_completed boolean default false,

  rating numeric default 5.0,
  total_completed_jobs integer default 0,
  total_earnings numeric default 0,

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- If table already existed, ensure id has a default so INSERT without id works
alter table public.detailers alter column id set default gen_random_uuid();

-- If table already existed without these columns (e.g. from an earlier run or single vehicle_type column), add them
alter table public.detailers add column if not exists vehicle_make text;
alter table public.detailers add column if not exists vehicle_model text;
alter table public.detailers add column if not exists vehicle_year integer;
alter table public.detailers add column if not exists vehicle_color text;
alter table public.detailers add column if not exists service_areas jsonb;
alter table public.detailers add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table public.detailers add column if not exists application_id uuid references public.detailer_applications(id) on delete set null;
alter table public.detailers add column if not exists profile_photo_url text;
alter table public.detailers add column if not exists is_online boolean default false;
alter table public.detailers add column if not exists is_approved boolean default true;
alter table public.detailers add column if not exists status text default 'active';
alter table public.detailers add column if not exists stripe_connect_account_id text;
alter table public.detailers add column if not exists stripe_connect_completed boolean default false;
alter table public.detailers add column if not exists rating numeric default 5.0;
alter table public.detailers add column if not exists total_completed_jobs integer default 0;
alter table public.detailers add column if not exists total_earnings numeric default 0;
alter table public.detailers add column if not exists updated_at timestamptz default now();
-- Ensure auth_user_id is unique (no-op if already unique)
create unique index if not exists detailers_auth_user_id_unique on public.detailers(auth_user_id) where auth_user_id is not null;

create index if not exists detailers_is_online_idx on public.detailers(is_online);
create index if not exists detailers_service_areas_idx on public.detailers using gin(service_areas);
create index if not exists detailers_auth_user_id_idx on public.detailers(auth_user_id);

alter table public.detailers enable row level security;

create policy "Detailers can select own profile"
  on public.detailers for select to authenticated
  using (auth.uid() = auth_user_id);

create policy "Detailers can update own profile"
  on public.detailers for update to authenticated
  using (auth.uid() = auth_user_id);
