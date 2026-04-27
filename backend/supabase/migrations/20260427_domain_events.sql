-- domain_events: append-only event log of everything that happens in Sylk.
-- This is the foundational table for the world-model thesis. Every project
-- created, expense recorded, worker assigned, phase progressed, voice note
-- received, or agent decision made writes one row here. The table is
-- additive forever — never deleted, never overwritten — so the full
-- history of every business is reconstructible.
--
-- Why this exists separately from chat_messages and project_transactions:
-- those are the "current state" tables (what is). domain_events is the
-- "everything that happened" log (what happened, when, why, by whom).
-- Phase 5 of the roadmap (cross-customer benchmarks, AI that runs the
-- business) requires a clean event log to learn from. Adding it now
-- means every customer from row 1 has clean history.

CREATE TABLE IF NOT EXISTS public.domain_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant boundary. Every event belongs to exactly one owner.
  -- RLS scopes reads by this column.
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- WHO did the thing. actor_id is the auth user (could be the owner, a
  -- supervisor under the owner, or NULL for system/agent events).
  -- actor_type lets us separate human from agent action without joining.
  actor_id UUID,
  actor_type TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('owner','supervisor','worker','agent','system','client','external')),

  -- WHAT happened. event_type is canonical (e.g. 'project.created',
  -- 'expense.recorded', 'phase.progress_updated'). event_category groups
  -- them ('project','financial','crew','scheduling','communication').
  event_type TEXT NOT NULL,
  event_category TEXT,

  -- WHICH entity the event is about. entity_type is the canonical name
  -- of the table/concept ('project','expense','worker','invoice','estimate',
  -- 'service_plan','daily_report'). entity_id is the row id when applicable.
  entity_type TEXT,
  entity_id UUID,

  -- THE DATA. payload is the structured event data; before_state and
  -- after_state are diffable snapshots for update events.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  before_state JSONB,
  after_state JSONB,

  -- THE WHY. Free-text reason ("client requested change order", "scope
  -- creep", "weather delay"). Provided by the user or extracted from
  -- conversation context. Critical for Phase 5 — a system that captures
  -- WHY becomes intelligence; one that captures only WHAT becomes a DB.
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'system'
    CHECK (source IN ('chat','manual','automation','webhook','cron','agent_tool','migration','system')),

  -- Semantic recall: agent reads this column at recall time to find
  -- relevant past events ("show me every scope-change on Smith bath").
  -- summary is a one-line human-readable description that gets embedded.
  summary TEXT,
  embedding vector(1536),
  embedding_model TEXT,

  -- Agent learning data. When the agent makes a decision (which tool to
  -- call, which entity to operate on, what plan to follow), it logs the
  -- decision here. user_feedback then records whether the user accepted
  -- or rejected the decision — that's training data for the next model.
  agent_decision JSONB,
  user_feedback TEXT
    CHECK (user_feedback IS NULL OR user_feedback IN ('approved','edited','rejected','ignored','undone')),

  -- Raw input preservation. Keep the original voice transcript, photo
  -- URL, original chat message, original webhook payload — even after
  -- it's been processed. Future models will be 10× better; the raw
  -- input is what they'll need to re-process. Never throw it away.
  raw_input JSONB,

  -- Temporal. occurred_at is when the event happened in the user's world
  -- (may differ from recorded_at for backfills, late webhooks, etc.).
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Relationships. session/message let us tie events back to the chat
  -- turn that triggered them. parent_event_id supports event chains
  -- (e.g. "project.created" → "phase.created" × N as a child chain).
  session_id UUID,
  message_id UUID,
  parent_event_id UUID REFERENCES public.domain_events(id),

  -- Schema versioning. When we change the canonical event_type or
  -- payload shape, bump this so old events stay readable.
  schema_version INT NOT NULL DEFAULT 1
);

-- Hot-path indexes. (owner_id, occurred_at DESC) covers the most common
-- query: "show me what happened recently for owner X." (owner_id,
-- entity_type, entity_id, occurred_at DESC) covers entity-history reads
-- ("show me everything that happened on this project"). The partial
-- index on user_feedback IS NOT NULL keeps the agent-training query
-- tight.
CREATE INDEX IF NOT EXISTS idx_domain_events_owner_occurred
  ON public.domain_events(owner_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_domain_events_owner_entity
  ON public.domain_events(owner_id, entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_domain_events_owner_event_type
  ON public.domain_events(owner_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_domain_events_owner_session
  ON public.domain_events(owner_id, session_id, occurred_at DESC)
  WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_domain_events_feedback
  ON public.domain_events(owner_id, user_feedback)
  WHERE user_feedback IS NOT NULL;

-- HNSW for sub-linear cosine search on the embedding column.
CREATE INDEX IF NOT EXISTS idx_domain_events_embedding_hnsw
  ON public.domain_events USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;

-- Owner reads their own events.
DROP POLICY IF EXISTS "owner_read_own" ON public.domain_events;
CREATE POLICY "owner_read_own" ON public.domain_events FOR SELECT
  USING (owner_id = (SELECT auth.uid()));

-- Supervisors under the owner can read the owner's events (read-only;
-- only the agent service role writes).
DROP POLICY IF EXISTS "supervisor_read_owner" ON public.domain_events;
CREATE POLICY "supervisor_read_owner" ON public.domain_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'supervisor'
      AND p.owner_id = domain_events.owner_id
  ));

-- Writes are service-role only — events are never written from the user
-- session client, only from the backend via emitDomainEvent().

NOTIFY pgrst, 'reload schema';
