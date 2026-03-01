-- One-time backfill: add customer role for every auth user who has no row in user_roles.
-- Run this in Supabase SQL Editor (e.g. after adding the auth trigger, to fix users who signed up before the trigger existed).

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'customer'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id
)
ON CONFLICT (user_id, role) DO NOTHING;
