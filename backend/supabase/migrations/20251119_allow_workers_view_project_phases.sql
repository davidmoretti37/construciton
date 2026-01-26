-- Allow workers to view project phases for projects they're assigned to

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Workers can view phases of assigned projects" ON public.project_phases;

-- Create policy for workers to view phases
CREATE POLICY "Workers can view phases of assigned projects"
ON public.project_phases FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.workers w
    WHERE w.user_id = auth.uid()
    AND (
      -- Worker is assigned to the project
      EXISTS (
        SELECT 1
        FROM public.project_assignments pa
        WHERE pa.worker_id = w.id
        AND pa.project_id = project_phases.project_id
      )
      -- OR worker's owner owns the project
      OR EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.id = project_phases.project_id
        AND p.user_id = w.owner_id
      )
    )
  )
);
