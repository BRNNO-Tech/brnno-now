-- Booking chat messages. Run in Supabase SQL Editor.
-- Enables real-time messaging between customers and detailers.

create table if not exists public.booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.detailer_bookings(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer', 'detailer')),
  sender_id uuid references auth.users(id) on delete set null,
  body text not null,
  created_at timestamptz default now() not null
);

alter table public.booking_messages enable row level security;

create policy "Users can read messages for own bookings or assigned jobs"
  on public.booking_messages for select to authenticated
  using (
    exists (select 1 from public.detailer_bookings b where b.id = booking_id and b.user_id = auth.uid())
    or exists (select 1 from public.detailer_bookings b where b.id = booking_id and (
      b.detailer_id = (select id from public.detailers where auth_user_id = auth.uid())
      or b.assigned_detailer_id = (select id from public.detailers where auth_user_id = auth.uid())
    ))
  );

create policy "Users can insert messages for own bookings or assigned jobs"
  on public.booking_messages for insert to authenticated
  with check (
    exists (select 1 from public.detailer_bookings b where b.id = booking_id and b.user_id = auth.uid())
    or exists (select 1 from public.detailer_bookings b where b.id = booking_id and (
      b.detailer_id = (select id from public.detailers where auth_user_id = auth.uid())
      or b.assigned_detailer_id = (select id from public.detailers where auth_user_id = auth.uid())
    ))
  );

create index if not exists booking_messages_booking_id_idx on public.booking_messages(booking_id);

-- Realtime: Enable in Supabase Dashboard (Database > Replication) or run:
-- alter publication supabase_realtime add table public.booking_messages;
