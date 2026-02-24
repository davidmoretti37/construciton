-- Agent Jobs: persistent job tracking for background agent processing
-- When a user sends an agent request and leaves the app, the backend
-- continues processing and stores results here for pickup on return.

CREATE TABLE IF NOT EXISTS agent_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'error')),
  accumulated_text TEXT DEFAULT '',
  visual_elements JSONB DEFAULT '[]'::jsonb,
  actions JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  notification_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_jobs_user_status
  ON agent_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_created
  ON agent_jobs(created_at);

ALTER TABLE agent_jobs ENABLE ROW LEVEL SECURITY;

-- Backend uses service role key, so this policy covers direct Supabase client access
CREATE POLICY "Users can view own agent jobs"
  ON agent_jobs FOR SELECT
  USING (user_id = auth.uid());
