-- Job completion checklist: one row per booking when detailer submits checklist before marking job complete.
-- Run in Supabase SQL Editor.

drop table if exists public.job_checklists cascade;

create table public.job_checklists (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.detailer_bookings(id) on delete cascade,
  detailer_id uuid not null references public.detailers(id) on delete cascade,
  completed_items jsonb not null default '[]',
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(booking_id)
);

create index idx_job_checklists_booking_id on public.job_checklists(booking_id);
create index idx_job_checklists_detailer_id on public.job_checklists(detailer_id);

alter table public.job_checklists enable row level security;

-- Detailer can insert and select their own checklists
create policy "Detailers can insert own job_checklists"
  on public.job_checklists for insert to authenticated
  with check (
    detailer_id = (select id from public.detailers where auth_user_id = auth.uid())
  );

create policy "Detailers can select own job_checklists"
  on public.job_checklists for select to authenticated
  using (
    detailer_id = (select id from public.detailers where auth_user_id = auth.uid())
  );

-- Admin can select all checklists (for booking detail view)
create policy "Admins can select all job_checklists"
  on public.job_checklists for select to authenticated
  using (
    exists (select 1 from public.admin_users where user_id = auth.uid())
  );

-- Admins can select any detailer_booking (for booking detail view and checklist)
drop policy if exists "Admins can select all detailer_bookings" on public.detailer_bookings;
create policy "Admins can select all detailer_bookings"
  on public.detailer_bookings for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid()));

select 1;
