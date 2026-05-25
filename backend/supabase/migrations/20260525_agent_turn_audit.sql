-- Agent reliability sealing — May 25, 2026
-- Two tables that make the agent infallible at the response boundary:
--   1. agent_turn_audit  — one row per agent turn. Captures user message,
--      tool calls + results, final response, claims extracted from the
--      response, the consistency check verdict, and any intervention
--      (rewrite) applied. The single grep-able truth of "what did the
--      agent actually do and say this turn?"
--   2. capability_gaps   — when the agent claims to do something AND
--      no tool exists to satisfy that claim, log what the user wanted.
--      Ranked aggregate = "features users want that we haven't built."

CREATE TABLE IF NOT EXISTS agent_turn_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid,
  user_id uuid NOT NULL,
  session_id text,
  user_message text,
  tool_calls jsonb DEFAULT '[]'::jsonb,
  tool_calls_count int DEFAULT 0,
  successful_tool_calls_count int DEFAULT 0,
  failed_tool_calls_count int DEFAULT 0,
  blocked_tool_calls_count int DEFAULT 0,
  final_response text,
  claims_extracted jsonb DEFAULT '[]'::jsonb,
  consistency_check jsonb DEFAULT '{}'::jsonb,
  capability_gap jsonb DEFAULT '{"detected": false}'::jsonb,
  intervention jsonb DEFAULT '{"occurred": false}'::jsonb,
  model text,
  total_duration_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_turn_audit_user_id ON agent_turn_audit (user_id);
CREATE INDEX IF NOT EXISTS idx_agent_turn_audit_created_at ON agent_turn_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_turn_audit_session_id ON agent_turn_audit (session_id);
CREATE INDEX IF NOT EXISTS idx_agent_turn_audit_intervention ON agent_turn_audit ((intervention->>'occurred')) WHERE (intervention->>'occurred')::boolean = true;
CREATE INDEX IF NOT EXISTS idx_agent_turn_audit_capability_gap ON agent_turn_audit ((capability_gap->>'detected')) WHERE (capability_gap->>'detected')::boolean = true;

ALTER TABLE agent_turn_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own audit rows" ON agent_turn_audit;
CREATE POLICY "Users read own audit rows" ON agent_turn_audit
  FOR SELECT USING (auth.uid() = user_id);

-- Service role bypasses RLS automatically; no insert policy needed for users
-- (audit rows are written exclusively by the backend with the service role key).

CREATE TABLE IF NOT EXISTS capability_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id text,
  user_message text,
  inferred_capability text NOT NULL,
  turn_audit_id uuid REFERENCES agent_turn_audit(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capability_gaps_capability ON capability_gaps (inferred_capability);
CREATE INDEX IF NOT EXISTS idx_capability_gaps_user_id ON capability_gaps (user_id);
CREATE INDEX IF NOT EXISTS idx_capability_gaps_created_at ON capability_gaps (created_at DESC);

ALTER TABLE capability_gaps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own capability gaps" ON capability_gaps;
CREATE POLICY "Users read own capability gaps" ON capability_gaps
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE agent_turn_audit IS 'Per-turn agent audit log. Source of truth for response-vs-trace consistency.';
COMMENT ON TABLE capability_gaps IS 'Features users have asked for that the agent has no tool to satisfy. Ranked aggregate = product backlog of real demand.';
