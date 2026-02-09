import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from './supabaseConfig';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local (see lib/supabaseConfig.example.ts).'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
