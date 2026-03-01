-- Add admin by email. Run in Supabase SQL Editor.
-- Replace 'your@email.com' with your actual email.

INSERT INTO public.admin_users (user_id, email)
SELECT id, email FROM auth.users WHERE email = 'your@email.com'
ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;
