import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client singleton.
 * Uses SUPABASE_SERVICE_ROLE_KEY to perform administrative actions and DB operations.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseClient =
  supabaseUrl && supabaseServiceRoleKey && !supabaseUrl.includes("YOUR_PROJECT_ID")
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null;
