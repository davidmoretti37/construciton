-- =====================================================
-- PEV telemetry table + aggregation views
-- =====================================================
-- Stores one row per Plan-Execute-Verify pipeline invocation. Backed by
-- the pushDispatchJob.recordPevTurn() call from agentService. Use
-- PEV_TELEMETRY_TABLE=pev_turns env to enable persistence (always-on
-- once this migration applies + the env is set).
--
-- Privacy: no message content, no tool args, no result data — only
-- shape (classification, plan size, tool names, timings, outcomes).

CREATE TABLE IF NOT EXISTS public.pev_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id TEXT,

  -- Pipeline outcome
  handoff TEXT NOT NULL CHECK (handoff IN ('foreman', 'ask', 'response', 'approval')),

  -- Stage details
  classification TEXT,
  classification_confidence NUMERIC(4,3),
  classification_fallback BOOLEAN DEFAULT FALSE,
  classify_ms INT,

  plan_ok BOOLEAN,
  plan_ms INT,
  step_count INT DEFAULT 0,

  execute_loops INT DEFAULT 0,
  execute_ok BOOLEAN,
  reached_steps INT DEFAULT 0,

  verify_loops INT DEFAULT 0,
  verify_satisfied BOOLEAN,
  verify_short_circuit BOOLEAN DEFAULT FALSE,

  respond_ms INT,
  respond_fallback BOOLEAN DEFAULT FALSE,

  total_ms INT,
  tools_used TEXT[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pev_turns_user_created ON public.pev_turns(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pev_turns_handoff_created ON public.pev_turns(handoff, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pev_turns_classification ON public.pev_turns(classification) WHERE classification IS NOT NULL;

-- RLS: per-user view; admin sees all (uses service role)
ALTER TABLE public.pev_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY pev_turns_user_select
  ON public.pev_turns FOR SELECT
  USING (auth.uid() = user_id);

-- Inserts come from the backend service role (the polling job runs
-- as service role and the agent path runs as user — but recordPevTurn
-- uses the service role client). No INSERT policy needed for users.

-- =====================================================
-- Aggregation view: last-7-day rollup per user
-- =====================================================
CREATE OR REPLACE VIEW public.pev_telemetry_7d AS
SELECT
  user_id,
  COUNT(*) AS turns,
  COUNT(*) FILTER (WHERE handoff = 'foreman') AS handoff_foreman,
  COUNT(*) FILTER (WHERE handoff = 'response') AS handoff_response,
  COUNT(*) FILTER (WHERE handoff = 'ask') AS handoff_ask,
  COUNT(*) FILTER (WHERE handoff = 'approval') AS handoff_approval,
  COUNT(*) FILTER (WHERE classification = 'simple') AS class_simple,
  COUNT(*) FILTER (WHERE classification = 'complex') AS class_complex,
  COUNT(*) FILTER (WHERE classification = 'briefing') AS class_briefing,
  COUNT(*) FILTER (WHERE classification = 'clarification') AS class_clarification,
  COUNT(*) FILTER (WHERE plan_ok = FALSE) AS plan_failures,
  COUNT(*) FILTER (WHERE execute_ok = FALSE) AS exec_failures,
  COUNT(*) FILTER (WHERE verify_satisfied = FALSE) AS verify_unsatisfied,
  ROUND(AVG(total_ms)::NUMERIC, 0) AS avg_total_ms,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_ms)::NUMERIC, 0) AS p50_total_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_ms)::NUMERIC, 0) AS p95_total_ms,
  ROUND(AVG(step_count)::NUMERIC, 1) AS avg_step_count,
  MAX(created_at) AS last_seen
FROM public.pev_turns
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY user_id;

ALTER VIEW public.pev_telemetry_7d OWNER TO postgres;
GRANT SELECT ON public.pev_telemetry_7d TO authenticated;

-- =====================================================
-- Aggregation view: tool-call frequency (last 7 days, per user)
-- Useful for "which tools are PEV reaching for most?" analysis.
-- =====================================================
CREATE OR REPLACE VIEW public.pev_tool_usage_7d AS
SELECT
  user_id,
  tool_name,
  COUNT(*) AS call_count
FROM public.pev_turns,
     LATERAL UNNEST(tools_used) AS tool_name
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY user_id, tool_name
ORDER BY user_id, call_count DESC;

ALTER VIEW public.pev_tool_usage_7d OWNER TO postgres;
GRANT SELECT ON public.pev_tool_usage_7d TO authenticated;

COMMENT ON TABLE public.pev_turns IS
  'One row per Plan-Execute-Verify pipeline invocation. Privacy-preserving: shape only, no content.';
COMMENT ON VIEW public.pev_telemetry_7d IS
  'Last 7-day rollup of PEV behavior per user. Use for an admin dashboard or per-user health check.';
COMMENT ON VIEW public.pev_tool_usage_7d IS
  'Per-user tool call frequency over the last 7 days, ranked.';
