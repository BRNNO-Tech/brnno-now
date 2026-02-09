-- Optional: run in Supabase SQL Editor when you no longer need the old marketplace tables.
-- Drops all marketplace_* tables from the previous marketplace version. Use only if you're sure.

drop table if exists public.marketplace_bookings cascade;
drop table if exists public.marketplace_customers cascade;
drop table if exists public.marketplace_disputes cascade;
drop table if exists public.marketplace_earnings cascade;
drop table if exists public.marketplace_messages cascade;
drop table if exists public.marketplace_notifications cascade;
drop table if exists public.marketplace_provider_details cascade;
drop table if exists public.marketplace_push_tokens cascade;
drop table if exists public.marketplace_reviews cascade;
drop table if exists public.marketplace_services cascade;
drop table if exists public.marketplace_vehicles cascade;
drop table if exists public.marketplace_active_businesses cascade;
