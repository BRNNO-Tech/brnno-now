-- When a detailer marks a job completed, update their total_completed_jobs and total_earnings.

create or replace function public.update_detailer_stats_on_complete()
returns trigger as $$
begin
  if NEW.status = 'completed' and (OLD is null or OLD.status != 'completed') and NEW.detailer_id is not null then
    update public.detailers
    set
      total_completed_jobs = coalesce(total_completed_jobs, 0) + 1,
      total_earnings = coalesce(total_earnings, 0) + coalesce(NEW.detailer_payout, NEW.cost * 0.8),
      updated_at = now()
    where id = NEW.detailer_id;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists detailer_bookings_on_complete_stats on public.detailer_bookings;
create trigger detailer_bookings_on_complete_stats
  after insert or update of status on public.detailer_bookings
  for each row
  execute function public.update_detailer_stats_on_complete();
