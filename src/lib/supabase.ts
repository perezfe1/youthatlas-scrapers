import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { loadBaseEnv } from '@/config/env.js';

let client: SupabaseClient | null = null;

/** Get a service-role Supabase client. Singleton — reused across the pipeline run. */
export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const env = loadBaseEnv();

  client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return client;
}
