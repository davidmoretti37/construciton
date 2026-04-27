-- Per-tenant persistent memory for the AI agent.
-- Backs Anthropic's memory_20250818 tool. The agent calls view/create/
-- str_replace/insert/delete/rename commands; backend/src/services/memoryTool.js
-- routes them to this table. Path traversal protection enforced server-side
-- (the path Claude sends is validated; rows are always scoped by user_id
-- regardless of what path Claude claims to be writing to).

CREATE TABLE IF NOT EXISTS public.agent_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  is_directory BOOLEAN NOT NULL DEFAULT false,
  byte_size INT GENERATED ALWAYS AS (octet_length(content)) STORED,
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, path)
);

CREATE INDEX IF NOT EXISTS idx_agent_memories_user_path
  ON public.agent_memories(user_id, path);
CREATE INDEX IF NOT EXISTS idx_agent_memories_user_accessed
  ON public.agent_memories(user_id, last_accessed_at DESC);

ALTER TABLE public.agent_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "self_read" ON public.agent_memories;
CREATE POLICY "self_read" ON public.agent_memories FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "self_write" ON public.agent_memories;
CREATE POLICY "self_write" ON public.agent_memories FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

NOTIFY pgrst, 'reload schema';
