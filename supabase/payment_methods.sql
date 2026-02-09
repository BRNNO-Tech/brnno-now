-- Run this in the Supabase SQL Editor to create the payment_methods table and RLS.
-- Used with Stripe: store only payment method metadata (no raw card data).

-- Optional: store Stripe customer id per user so we can reuse for SetupIntents and PaymentIntents
create table if not exists public.stripe_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique
);

alter table public.stripe_customers enable row level security;

create policy "Users can manage own stripe_customers row"
  on public.stripe_customers for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now() not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_payment_method_id text not null unique,
  stripe_customer_id text,
  last4 text not null,
  brand text not null,
  expiry_month smallint not null,
  expiry_year smallint not null,
  is_default boolean default false not null
);

create index if not exists idx_payment_methods_user_id on public.payment_methods(user_id);

alter table public.payment_methods enable row level security;

-- Users can only see and manage their own payment methods
create policy "Users can select own payment methods"
  on public.payment_methods for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own payment methods"
  on public.payment_methods for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own payment methods"
  on public.payment_methods for update to authenticated
  using (auth.uid() = user_id);

create policy "Users can delete own payment methods"
  on public.payment_methods for delete to authenticated
  using (auth.uid() = user_id);
