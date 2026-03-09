-- One review per booking: rating, optional review text, optional tip (tip_amount also stored on detailer_bookings).
-- detailers.rating is updated by trigger to AVG(booking_reviews.rating) per detailer.

create table if not exists public.booking_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.detailer_bookings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  detailer_id uuid not null references public.detailers(id) on delete cascade,
  rating integer not null check (rating >= 1 and rating <= 5),
  review_text text,
  tip_amount integer not null default 0,
  created_at timestamptz default now() not null,
  unique(booking_id)
);

create index if not exists idx_booking_reviews_booking_id on public.booking_reviews(booking_id);
create index if not exists idx_booking_reviews_detailer_id on public.booking_reviews(detailer_id);
create index if not exists idx_booking_reviews_user_id on public.booking_reviews(user_id);

alter table public.booking_reviews enable row level security;

-- Customers can insert/select their own reviews
create policy "Users can insert own booking_reviews"
  on public.booking_reviews for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can select own booking_reviews"
  on public.booking_reviews for select to authenticated
  using (auth.uid() = user_id);

-- Detailers can select reviews for themselves (Recent Reviews on dashboard)
create policy "Detailers can select reviews for self"
  on public.booking_reviews for select to authenticated
  using (
    detailer_id = (select id from public.detailers where auth_user_id = auth.uid())
  );

-- Trigger: keep detailers.rating = AVG(rating) from booking_reviews for that detailer
create or replace function public.update_detailer_rating_from_reviews()
returns trigger as $$
begin
  update public.detailers
  set
    rating = (select coalesce(round(avg(rating)::numeric, 1), 5) from public.booking_reviews where detailer_id = coalesce(NEW.detailer_id, OLD.detailer_id)),
    updated_at = now()
  where id = coalesce(NEW.detailer_id, OLD.detailer_id);
  return coalesce(NEW, OLD);
end;
$$ language plpgsql security definer;

drop trigger if exists booking_reviews_update_detailer_rating on public.booking_reviews;
create trigger booking_reviews_update_detailer_rating
  after insert or update of rating or delete on public.booking_reviews
  for each row
  execute function public.update_detailer_rating_from_reviews();

select 1;
