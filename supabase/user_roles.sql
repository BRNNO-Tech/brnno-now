-- User roles table for role-based auth (customer | detailer | saas_owner)
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  created_at timestamptz default now() not null,
  unique(user_id, role)
);

create index if not exists user_roles_user_id_idx on public.user_roles(user_id);

alter table public.user_roles enable row level security;

create policy "Users can view own roles"
  on public.user_roles for select
  using (auth.uid() = user_id);

create policy "Users can insert own customer role"
  on public.user_roles for insert
  with check (auth.uid() = user_id and role = 'customer');

-- Auto-assign detailer role when a row is inserted into detailers
create or replace function public.set_detailer_role_on_detailer_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auth_user_id is not null then
    insert into public.user_roles (user_id, role)
    values (new.auth_user_id, 'detailer')
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists detailers_set_detailer_role on public.detailers;
create trigger detailers_set_detailer_role
  after insert on public.detailers
  for each row
  execute function public.set_detailer_role_on_detailer_insert();
