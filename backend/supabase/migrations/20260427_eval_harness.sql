-- Eval harness persistence layer.
-- One row per test run in eval_runs, one row per (run, test_case) in eval_results.
-- Two views power a "trends, not snapshots" dashboard. RLS locks writes to
-- service_role since this is dev tooling — no app code should touch these.

CREATE TABLE IF NOT EXISTS public.eval_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  git_sha TEXT,
  git_branch TEXT,
  trigger TEXT,                                 -- 'pr' | 'main' | 'manual' | 'nightly'
  pr_number INT,
  suite TEXT NOT NULL DEFAULT 'full',           -- 'smoke' | 'full'
  total_cases INT NOT NULL DEFAULT 0,
  passed_cases INT NOT NULL DEFAULT 0,
  failed_cases INT NOT NULL DEFAULT 0,
  total_cost_cents INT NOT NULL DEFAULT 0,
  total_duration_ms INT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_eval_runs_started_at
  ON public.eval_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_runs_branch_started
  ON public.eval_runs(git_branch, started_at DESC);

CREATE TABLE IF NOT EXISTS public.eval_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.eval_runs(id) ON DELETE CASCADE,
  test_id TEXT NOT NULL,
  category TEXT,                                -- 'project_creation' | 'clarifying_question' | 'edge_case' | etc.
  passed BOOLEAN NOT NULL,
  score NUMERIC(5,4),                           -- 0.0–1.0 if LLM-judge used
  model TEXT,
  latency_ms INT,
  input_tokens INT,
  output_tokens INT,
  cache_read_tokens INT,
  cache_write_tokens INT,
  cost_cents INT,
  prompt TEXT,
  response_text TEXT,
  expected JSONB,
  actual JSONB,
  tool_calls JSONB,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eval_results_run_id
  ON public.eval_results(run_id);
CREATE INDEX IF NOT EXISTS idx_eval_results_test_id_created
  ON public.eval_results(test_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_results_passed
  ON public.eval_results(passed) WHERE passed = false;

ALTER TABLE public.eval_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eval_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON public.eval_runs;
CREATE POLICY "service_role_only" ON public.eval_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_only" ON public.eval_results;
CREATE POLICY "service_role_only" ON public.eval_results FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Daily pass-rate trend per branch.
CREATE OR REPLACE VIEW public.eval_dashboard_pass_rate AS
SELECT
  date_trunc('day', started_at) AS day,
  git_branch,
  COUNT(*) AS runs,
  ROUND(AVG(
    CASE WHEN total_cases > 0
         THEN passed_cases::numeric / total_cases
         ELSE 0
    END
  ) * 100, 2) AS avg_pass_pct,
  SUM(total_cost_cents) AS total_cost_cents
FROM public.eval_runs
WHERE finished_at IS NOT NULL
GROUP BY 1, 2
ORDER BY 1 DESC;

-- Find flaky / chronically-failing cases (last 30 days).
CREATE OR REPLACE VIEW public.eval_dashboard_flaky_cases AS
SELECT
  test_id,
  COUNT(*) AS total_runs,
  COUNT(*) FILTER (WHERE passed) AS passed,
  ROUND(COUNT(*) FILTER (WHERE passed)::numeric / NULLIF(COUNT(*),0) * 100, 2) AS pass_pct
FROM public.eval_results
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY test_id
HAVING COUNT(*) >= 3
ORDER BY pass_pct ASC, total_runs DESC;

NOTIFY pgrst, 'reload schema';
