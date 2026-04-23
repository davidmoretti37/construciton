-- Allow workers to view any project they are assigned to via
-- project_assignments, regardless of whether projects.user_id matches
-- their workers.owner_id. Without this, the TimeClockScreen embedded
-- join (project_assignments + projects:project_id(...)) resolves to
-- null for the worker when:
--   * a supervisor created the project (projects.user_id = supervisor id)
--   * the worker's owner_id is null or points to a different owner
-- and the UI falls back to the misleading "No Projects — your manager
-- has not created any projects yet" alert.
--
-- project_phases already has an equivalent OR-clause policy; this brings
-- projects in line.

DROP POLICY IF EXISTS "Workers can view assigned projects" ON public.projects;

CREATE POLICY "Workers can view assigned projects"
ON public.projects FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.project_assignments pa
    JOIN public.workers w ON w.id = pa.worker_id
    WHERE pa.project_id = projects.id
    AND w.user_id = auth.uid()
  )
);
