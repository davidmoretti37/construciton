-- =====================================================
-- PROJECT CHECKLIST ITEMS
-- Created: 2026-04-29
-- Purpose: Per-phase checklist rows with explicit ordering and
--          done-state, replacing the prior tasks JSONB on project_phases
--          for owner-side phase/checklist CRUD (TaskManager UI).
-- Foundation type: ChecklistItem in src/lib/types.ts
--          { id, phase_id, title, done, position, created_at }
-- =====================================================

CREATE TABLE IF NOT EXISTS public.project_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES public.project_phases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_checklist_items_phase
  ON public.project_checklist_items(phase_id);

CREATE INDEX IF NOT EXISTS idx_project_checklist_items_phase_position
  ON public.project_checklist_items(phase_id, position);

ALTER TABLE public.project_checklist_items ENABLE ROW LEVEL SECURITY;

-- Owner can view checklist items for phases on their own projects.
CREATE POLICY "Owners view own project checklist items"
  ON public.project_checklist_items FOR SELECT
  USING (
    phase_id IN (
      SELECT pp.id FROM public.project_phases pp
      JOIN public.projects p ON p.id = pp.project_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners insert own project checklist items"
  ON public.project_checklist_items FOR INSERT
  WITH CHECK (
    phase_id IN (
      SELECT pp.id FROM public.project_phases pp
      JOIN public.projects p ON p.id = pp.project_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners update own project checklist items"
  ON public.project_checklist_items FOR UPDATE
  USING (
    phase_id IN (
      SELECT pp.id FROM public.project_phases pp
      JOIN public.projects p ON p.id = pp.project_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners delete own project checklist items"
  ON public.project_checklist_items FOR DELETE
  USING (
    phase_id IN (
      SELECT pp.id FROM public.project_phases pp
      JOIN public.projects p ON p.id = pp.project_id
      WHERE p.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.project_checklist_items IS
  'Per-phase checklist rows. Owner-side TaskManager CRUD target; coexists with project_phases.tasks JSONB used by legacy worker portal reads.';
