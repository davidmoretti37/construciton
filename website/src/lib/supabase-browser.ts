import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

// Single global instance — stored on window to survive HMR and re-renders
export function createClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  if (typeof window === "undefined") {
    // During SSR/prerender — return a client (may be non-functional if env vars missing)
    return createSupabaseClient(url || "https://placeholder.supabase.co", key || "placeholder");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (!w.__supabase) {
    w.__supabase = createSupabaseClient(
      url,
      key,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    );
  }
  return w.__supabase;
}
