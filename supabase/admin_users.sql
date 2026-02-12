-- Admin users: who can access /admin and assign jobs.
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read their own data"
ON public.admin_users FOR SELECT
USING (auth.uid() = user_id);

-- Add yourself: get your user ID from Supabase Auth (Dashboard -> Authentication -> Users), then run:
-- INSERT INTO public.admin_users (user_id, email) VALUES ('your-auth-uuid', 'jinrix@luminarkai.com');

-- Admins can select all approved detailers (for dropdown)
CREATE POLICY "Admins can select all detailers"
ON public.detailers FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
);

-- Admins can update pending bookings to assign a detailer
CREATE POLICY "Admins can update pending bookings for assignment"
ON public.detailer_bookings FOR UPDATE
USING (
  status = 'pending'
  AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
);
