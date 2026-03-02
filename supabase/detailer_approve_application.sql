-- Approve a detailer application by creating a detailer row and linking it to the application.
-- Run in Supabase SQL Editor.
--
-- 1. In Table Editor, open detailer_applications and note the application id and user_id (auth user who applied).
-- 2. Replace the two UUIDs below with that application id and user_id.
-- 3. Run this script.

-- EXAMPLE: approve application id 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' for auth user 'yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy'
/*
INSERT INTO public.detailers (
  application_id,
  auth_user_id,
  name,
  email,
  phone,
  is_approved
)
SELECT
  a.id,
  a.user_id,
  a.full_name,
  a.email,
  a.phone,
  true
FROM public.detailer_applications a
WHERE a.id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
  AND a.user_id = 'yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy';
*/

-- Single-application version: replace ONLY the application UUID, then run.
-- (Uses the application's user_id, full_name, email, phone.)
INSERT INTO public.detailers (
  application_id,
  auth_user_id,
  name,
  email,
  phone,
  is_approved
)
SELECT
  a.id,
  a.user_id,
  a.full_name,
  a.email,
  a.phone,
  true
FROM public.detailer_applications a
WHERE a.id = 'REPLACE_WITH_APPLICATION_ID';
