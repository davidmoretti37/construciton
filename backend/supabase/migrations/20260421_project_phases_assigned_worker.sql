-- Add assigned_worker_id to project_phases so per-phase worker assignment
-- can persist from the ProjectBuilder "Configure Project" flow.
ALTER TABLE public.project_phases
  ADD COLUMN IF NOT EXISTS assigned_worker_id UUID
    REFERENCES public.workers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_phases_assigned_worker
  ON public.project_phases(assigned_worker_id)
  WHERE assigned_worker_id IS NOT NULL;

-- Reload PostgREST's schema cache so API clients pick up the new column.
NOTIFY pgrst, 'reload schema';
