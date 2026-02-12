-- Status default, commission_rate, and payout trigger for detailer_bookings.

alter table public.detailer_bookings
  alter column status set default 'pending';

alter table public.detailer_bookings
  add column if not exists commission_rate decimal default 0.20;

create or replace function public.calculate_detailer_payout()
returns trigger as $$
begin
  if NEW.status = 'assigned' and OLD.status = 'pending' then
    NEW.detailer_payout = NEW.cost * (1 - COALESCE(NEW.commission_rate, 0.20));
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists calculate_payout_trigger on public.detailer_bookings;
create trigger calculate_payout_trigger
  before update on public.detailer_bookings
  for each row
  execute function public.calculate_detailer_payout();

select 1;
