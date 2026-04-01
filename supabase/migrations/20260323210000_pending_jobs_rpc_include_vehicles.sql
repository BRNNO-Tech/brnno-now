-- Expose vehicles JSON on pending jobs for detailer UI.
drop function if exists public.get_pending_bookings_for_detailer();

create or replace function public.get_pending_bookings_for_detailer()
returns table (
  id uuid,
  service_name text,
  cost numeric,
  location text,
  address_zip text,
  created_at timestamptz,
  subtotal_cents integer,
  add_ons text[],
  dirtiness_level text,
  vehicles jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    b.id,
    b.service_name,
    b.cost,
    b.location,
    b.address_zip,
    b.created_at,
    b.subtotal_cents,
    b.add_ons,
    b.dirtiness_level,
    b.vehicles
  from public.detailer_bookings b
  where b.status = 'pending'
    and b.detailer_id is null
    and (
      b.assigned_detailer_id is null
      or b.assigned_detailer_id = (
        select d.id from public.detailers d where d.auth_user_id = auth.uid() limit 1
      )
    )
  order by b.created_at desc;
$$;

revoke all on function public.get_pending_bookings_for_detailer() from public;
grant execute on function public.get_pending_bookings_for_detailer() to authenticated;
