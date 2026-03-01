-- Run in Supabase SQL Editor.
-- When a new user signs up (row in auth.users), automatically add the customer role to user_roles.
-- This avoids relying on the client, which may not have a session yet (e.g. if email confirmation is required).

create or replace function public.handle_new_user_add_customer_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, 'customer')
  on conflict (user_id, role) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_add_customer_role on auth.users;
create trigger on_auth_user_created_add_customer_role
  after insert on auth.users
  for each row
  execute function public.handle_new_user_add_customer_role();
