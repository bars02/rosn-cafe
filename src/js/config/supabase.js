// Supabase Client Initialization
import { createClient } from '@supabase/supabase-js';

const env = import.meta.env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || 'https://eyytuhcylwxankibpuzc.supabase.co';
const supabaseKey =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eXR1aGN5bHd4YW5raWJwdXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNjY4MTgsImV4cCI6MjEwODc0MjgxOH0.MKcBJvUIdIEw2OEdbvp_0tE37Verezj9ubNJ53TvE98';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseKey &&
  !supabaseUrl.includes('your-project-id') &&
  !supabaseKey.includes('your-anon-public-key')
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
