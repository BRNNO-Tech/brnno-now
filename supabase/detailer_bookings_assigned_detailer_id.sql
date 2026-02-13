-- Add assigned_detailer_id column for admin-assigned jobs.
-- Run in Supabase SQL Editor.

alter table public.detailer_bookings
  add column if not exists assigned_detailer_id uuid references public.detailers(id) on delete set null;

create index if not exists detailer_bookings_assigned_detailer_id_idx
  on public.detailer_bookings(assigned_detailer_id);

-- Update RLS so detailers can see jobs assigned to them
drop policy if exists "Detailers can select own or pending bookings" on public.detailer_bookings;
create policy "Detailers can select own or pending bookings"
  on public.detailer_bookings for select to authenticated
  using (
    auth.uid() = user_id
    or detailer_id = (select id from public.detailers where auth_user_id = auth.uid())
    or assigned_detailer_id = (select id from public.detailers where auth_user_id = auth.uid())
    or status = 'pending'
  );

drop policy if exists "Detailers can update pending or own bookings" on public.detailer_bookings;
create policy "Detailers can update pending or own bookings"
  on public.detailer_bookings for update to authenticated
  using (
    detailer_id = (select id from public.detailers where auth_user_id = auth.uid())
    or assigned_detailer_id = (select id from public.detailers where auth_user_id = auth.uid())
    or status = 'pending'
  );
