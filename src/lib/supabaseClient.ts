import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Allow the app to run without Supabase credentials (falls back to mock data)
export const isSupabaseConfigured =
  !!supabaseUrl &&
  !!supabaseKey &&
  supabaseUrl !== 'your-project-url-here' &&
  supabaseKey !== 'your-publishable-key-here';

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey)
  : null;
