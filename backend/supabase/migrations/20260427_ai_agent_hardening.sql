-- AI agent hardening migration
--   1. Create user_api_usage for per-user monthly budget tracking + kill switch
--   2. Add monthly_ai_budget_cents override on profiles (NULL = use env default)
--   3. Enable RLS on service_plans (the only public table that was missing it)
--   4. Reload PostgREST schema cache so the new policies take effect
-- Idempotent — safe to re-run on partially-migrated environments.

CREATE TABLE IF NOT EXISTS public.user_api_usage (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  month_start DATE NOT NULL DEFAULT date_trunc('month', NOW())::date,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  request_count INT NOT NULL DEFAULT 0,
  cost_cents INT NOT NULL DEFAULT 0,
  hard_blocked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_api_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "self_read" ON public.user_api_usage;
CREATE POLICY "self_read" ON public.user_api_usage FOR SELECT
  USING (user_id = (SELECT auth.uid()));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS monthly_ai_budget_cents INT;

ALTER TABLE public.service_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_full_access" ON public.service_plans;
CREATE POLICY "owner_full_access" ON public.service_plans FOR ALL
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "supervisor_read" ON public.service_plans;
CREATE POLICY "supervisor_read" ON public.service_plans FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'supervisor'
      AND p.owner_id = service_plans.owner_id
  ));

NOTIFY pgrst, 'reload schema';
