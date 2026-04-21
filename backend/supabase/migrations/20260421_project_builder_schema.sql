-- Project builder schema additions (Configure Details path)
-- Adds per-phase worker assignment, linked estimate FK on projects, and a partial
-- index to make draft cleanup and draft listings cheap.
-- Note: project_documents already exists from an earlier migration (see
-- 20260122_add_document_visibility.sql and 20260326_service_plan_linked_tables.sql
-- which ALTER it). Intentionally NOT re-creating it here.

-- Per-phase worker assignment (phase_id NULL = whole-project)
ALTER TABLE public.project_assignments
  ADD COLUMN IF NOT EXISTS phase_id UUID NULL REFERENCES public.project_phases(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_project_assignments_phase
  ON public.project_assignments(project_id, phase_id);

-- Linked estimate FK on projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS linked_estimate_id UUID NULL REFERENCES public.estimates(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_linked_estimate
  ON public.projects(linked_estimate_id) WHERE linked_estimate_id IS NOT NULL;

-- Partial index for fast draft cleanup + drafts list
CREATE INDEX IF NOT EXISTS idx_projects_drafts
  ON public.projects(user_id, updated_at)
  WHERE status = 'draft';
