// Per-request Supabase clients. Tools should use `userSupabase(jwt)` for any
// query against tenant data — that client carries the caller's JWT, so RLS
// enforces ownership automatically. Reserve `adminSupabase` for paths that
// genuinely need to bypass RLS (notification fan-out across recipients,
// agent_jobs persistence, system jobs).

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminSupabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function userSupabase(jwt) {
  if (!jwt) return adminSupabase;
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

module.exports = { userSupabase, adminSupabase };
