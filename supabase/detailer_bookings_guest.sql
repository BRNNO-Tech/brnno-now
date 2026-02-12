-- Guest booking support: nullable user_id, guest columns, RLS for anon insert.

alter table public.detailer_bookings
  alter column user_id drop not null;

alter table public.detailer_bookings
  add column if not exists is_guest boolean not null default false,
  add column if not exists guest_name text,
  add column if not exists guest_email text,
  add column if not exists guest_phone text;

create policy "Allow guest booking insert"
  on public.detailer_bookings for insert to anon
  with check (is_guest = true and user_id is null);

select 1;
