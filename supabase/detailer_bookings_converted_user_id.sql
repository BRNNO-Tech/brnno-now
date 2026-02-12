-- Link guest bookings to user when they create an account.

alter table public.detailer_bookings
  add column if not exists converted_user_id uuid references auth.users(id) on delete set null;

create policy "Users can select converted guest bookings"
  on public.detailer_bookings for select to authenticated
  using (auth.uid() = converted_user_id);

create policy "Users can set converted_user_id on own guest booking"
  on public.detailer_bookings for update to authenticated
  using (
    user_id is null
    and is_guest = true
    and (auth.jwt()->>'email') = guest_email
  )
  with check (converted_user_id = auth.uid());

select 1;
