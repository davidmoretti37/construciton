export const ENV = {
  BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || "",
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
} as const;

export type EnvKey = keyof typeof ENV;

export function envPresence(): Record<EnvKey, boolean> {
  return {
    BACKEND_URL: Boolean(ENV.BACKEND_URL),
    SUPABASE_URL: Boolean(ENV.SUPABASE_URL),
    SUPABASE_ANON_KEY: Boolean(ENV.SUPABASE_ANON_KEY),
  };
}
