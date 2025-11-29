-- Allow workers to view all projects from their owner (for clock-in selection)
-- This is in addition to the existing policy that shows assigned projects

CREATE POLICY "Workers can view owner projects for clock-in"
ON public.projects FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workers w
    WHERE w.owner_id = projects.user_id
    AND w.user_id = auth.uid()
  )
);
