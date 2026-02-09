alter table public.detailer_bookings
  add column if not exists detailer_id uuid references public.detailers(id) on delete set null,
  add column if not exists detailer_assigned_at timestamptz,
  add column if not exists detailer_accepted_at timestamptz,
  add column if not exists detailer_arrived_at timestamptz,
  add column if not exists detailer_completed_at timestamptz,
  add column if not exists commission_amount numeric,
  add column if not exists detailer_payout numeric,
  add column if not exists address_zip text;

alter table public.detailer_bookings alter column detailer_name drop not null;
alter table public.detailer_bookings alter column car_name drop not null;

alter table public.detailer_bookings drop constraint if exists detailer_bookings_status_check;
alter table public.detailer_bookings
  add constraint detailer_bookings_status_check
  check (status in ('pending', 'assigned', 'en_route', 'in_progress', 'completed', 'cancelled'));

create index if not exists detailer_bookings_status_idx on public.detailer_bookings(status);
create index if not exists detailer_bookings_detailer_id_idx on public.detailer_bookings(detailer_id);

drop policy if exists "Detailers can select own or pending bookings" on public.detailer_bookings;
create policy "Detailers can select own or pending bookings"
  on public.detailer_bookings for select to authenticated
  using (
    auth.uid() = user_id
    or detailer_id = (select id from public.detailers where auth_user_id = auth.uid())
    or status = 'pending'
  );

drop policy if exists "Detailers can update pending or own bookings" on public.detailer_bookings;
create policy "Detailers can update pending or own bookings"
  on public.detailer_bookings for update to authenticated
  using (
    detailer_id = (select id from public.detailers where auth_user_id = auth.uid())
    or status = 'pending'
  );

select 1;
