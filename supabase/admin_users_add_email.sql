-- Add email column to admin_users (run if table already exists)
ALTER TABLE public.admin_users
ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';

-- Rename policy to match new naming
DROP POLICY IF EXISTS "Admins can read admin_users" ON public.admin_users;
CREATE POLICY "Admins can read their own data"
ON public.admin_users FOR SELECT
USING (auth.uid() = user_id);
