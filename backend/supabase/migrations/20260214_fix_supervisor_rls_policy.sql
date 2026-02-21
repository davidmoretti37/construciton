-- Fix supervisor RLS policy to allow BOTH supervisors AND owners to update projects
--
-- ISSUE: The original "Supervisors can update assigned projects" policy had:
--   WITH CHECK (assigned_supervisor_id = auth.uid())
-- This blocked owners from updating when assigned_supervisor_id = NULL
--
-- PostgreSQL RLS evaluates ALL policies - if ANY WITH CHECK fails, UPDATE fails
-- We need the supervisor policy to pass for both supervisors AND owners

-- Drop the restrictive policy
DROP POLICY IF EXISTS "Supervisors can update assigned projects" ON public.projects;

-- Recreate with WITH CHECK that allows both supervisors and owners
CREATE POLICY "Supervisors can update assigned projects"
ON public.projects FOR UPDATE
USING (assigned_supervisor_id = auth.uid())
WITH CHECK (
  assigned_supervisor_id = auth.uid()  -- Supervisor can update their assigned projects
  OR
  EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = projects.id
    AND p.user_id = auth.uid()  -- OR owner can update their own projects
  )
);

-- Add explanatory comment
COMMENT ON POLICY "Supervisors can update assigned projects" ON public.projects IS
  'Allows supervisors to update projects assigned to them, and owners to update their own projects. Both conditions in WITH CHECK ensure the policy does not block legitimate owner updates.';
