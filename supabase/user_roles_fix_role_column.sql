-- Fix rows where "role" was set to a UUID by mistake. Sets role to 'customer'.
-- Run in Supabase SQL Editor.

UPDATE public.user_roles
SET role = 'customer'
WHERE role NOT IN ('customer', 'detailer', 'saas_owner');
