-- =====================================================
-- Import conflicts — fuzzy match resolution queue
-- Created: 2026-04-30
-- Purpose: When an import (QBO / CSV / Monday) finds an
-- existing local row that's likely-but-not-certainly the
-- same entity (same name, different email; or close-name,
-- different phone) it stashes the pair here instead of
-- creating a duplicate. The agent surfaces each conflict
-- and asks the user "merge or keep separate?" — resolution
-- is recorded for audit + dedup hints next time.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.import_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  source_platform TEXT NOT NULL
    CHECK (source_platform IN ('qbo', 'monday', 'csv', 'manual')),
  target_table TEXT NOT NULL
    CHECK (target_table IN ('clients', 'workers', 'projects')),

  -- The external record we couldn't safely auto-merge
  external_id TEXT,                    -- e.g. QBO Customer.Id
  external_data JSONB NOT NULL,        -- snapshot for display

  -- The local row that's a candidate match
  candidate_local_id UUID,             -- FK-ish — see resolution flow
  candidate_local_data JSONB,          -- snapshot for display

  -- Why this was flagged (drives the agent's question)
  match_type TEXT NOT NULL
    CHECK (match_type IN ('fuzzy_name', 'email_diff_phone', 'multiple_candidates', 'name_only')),
  match_score NUMERIC(4, 3),           -- 0.0–1.0 confidence; null when n/a

  -- Resolution
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'merged', 'kept_separate', 'skipped')),
  resolved_at TIMESTAMPTZ,
  resolved_note TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_import_conflicts_user_pending
  ON public.import_conflicts(user_id, status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_import_conflicts_external
  ON public.import_conflicts(user_id, source_platform, external_id);

-- Re-runs of the same import shouldn't create duplicate conflict rows.
-- Same (user, platform, external_id, candidate) → upsert.
CREATE UNIQUE INDEX IF NOT EXISTS uq_import_conflicts_open
  ON public.import_conflicts(user_id, source_platform, external_id, candidate_local_id)
  WHERE status = 'pending';

ALTER TABLE public.import_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_conflicts_owner_all ON public.import_conflicts;
CREATE POLICY import_conflicts_owner_all
  ON public.import_conflicts
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_import_conflicts_updated_at ON public.import_conflicts;
CREATE TRIGGER trg_import_conflicts_updated_at
  BEFORE UPDATE ON public.import_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.import_conflicts IS
  'Queue of likely-duplicate matches that need user confirmation before merge during imports.';
