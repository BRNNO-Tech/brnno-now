-- For projects that already created detailer_applications from the original SQL.
-- Run this in the Supabase SQL Editor to add business/vendor columns (all nullable for existing rows).

alter table public.detailer_applications add column if not exists business_name text;
alter table public.detailer_applications add column if not exists ein text;
alter table public.detailer_applications add column if not exists business_type text;
alter table public.detailer_applications add column if not exists dba text;
alter table public.detailer_applications add column if not exists business_street text;
alter table public.detailer_applications add column if not exists business_city text;
alter table public.detailer_applications add column if not exists business_state text;
alter table public.detailer_applications add column if not exists business_zip text;
