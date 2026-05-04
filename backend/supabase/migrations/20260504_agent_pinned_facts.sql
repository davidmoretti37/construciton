-- =====================================================
-- agent_pinned_facts — short-lived in-flight state for the agent
-- =====================================================
-- The agent's memory system already handles long-term durable facts
-- (preferences, defaults, names) via agent_memories. This table fills
-- a different need: SHORT-LIVED in-flight state that the agent needs
-- to remember across turns within a session but doesn't belong in
-- permanent memory.
--
-- Examples:
--   active_project       → "Smith Bathroom Remodel" (the project the
--                           user is currently working on)
--   pending_co           → "CO-007 awaiting client response since 5/2"
--                           (so when user comes back tomorrow, agent knows)
--   in_flight_estimate   → "Henderson Kitchen draft, 60% done"
--   last_action          → "deleted CO-005 (duplicate)"
--
-- Default TTL: 7 days. The agent uses two tools:
--   pin_fact({ key, value, ttl_days? })
--   unpin_fact({ key })
-- Pinned facts get auto-loaded into the system prompt at every request.

CREATE TABLE IF NOT EXISTS public.agent_pinned_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Stable identifier the agent uses to overwrite the same logical pin.
  -- Pinning the same key twice REPLACES the value — that's the point.
  key TEXT NOT NULL,
  -- The actual fact, in plain language. Kept short — these go straight
  -- into the system prompt, so verbose pins waste tokens every turn.
  value TEXT NOT NULL CHECK (length(value) <= 500),
  -- When this pin auto-expires. NULL = doesn't expire.
  -- Default 7 days from now; agent can override per-pin.
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- One pin per (user, key). Pinning the same key replaces the value.
  UNIQUE (user_id, key)
);

-- Simple per-user index. We filter expired rows in application code.
-- (Postgres rejects NOW() in index predicates because it's not IMMUTABLE.)
CREATE INDEX IF NOT EXISTS idx_pinned_facts_user
  ON public.agent_pinned_facts (user_id, expires_at);

-- RLS: per-user
ALTER TABLE public.agent_pinned_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY pinned_facts_user_select
  ON public.agent_pinned_facts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY pinned_facts_user_insert
  ON public.agent_pinned_facts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY pinned_facts_user_update
  ON public.agent_pinned_facts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY pinned_facts_user_delete
  ON public.agent_pinned_facts FOR DELETE
  USING (auth.uid() = user_id);

-- Touch updated_at on update
CREATE OR REPLACE FUNCTION public.agent_pinned_facts_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_pinned_facts_touch ON public.agent_pinned_facts;
CREATE TRIGGER trg_agent_pinned_facts_touch
  BEFORE UPDATE ON public.agent_pinned_facts
  FOR EACH ROW EXECUTE FUNCTION public.agent_pinned_facts_touch();

COMMENT ON TABLE public.agent_pinned_facts IS
  'Short-lived in-flight state the agent pins across turns. Auto-loaded into system prompt per request. Default 7-day TTL.';
