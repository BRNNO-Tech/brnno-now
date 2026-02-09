-- Run once in Supabase SQL editor after applying user_roles.sql
-- Backfill detailer role for existing detailers (so they can sign in at /detailer/signin)

insert into public.user_roles (user_id, role)
select auth_user_id, 'detailer'
from public.detailers
where auth_user_id is not null
on conflict (user_id, role) do nothing;

-- If a detailer still gets redirected to main app when signing in at /detailer/signin,
-- grant the role manually (replace with the auth UUID for that user):
--   select id from auth.users where email = 'detailer@example.com';
--   insert into public.user_roles (user_id, role) values ('paste-uuid-here', 'detailer')
--   on conflict (user_id, role) do nothing;
