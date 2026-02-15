-- =====================================================
-- Fix: Allow Supervisors to View Their Owner's Workers
-- Created: 2026-02-13
-- Purpose: Supervisors need to see all workers from their parent owner
--          to assign them to projects
-- =====================================================

-- Drop the old policy if it exists
DROP POLICY IF EXISTS "Supervisors can view owner workers" ON public.workers;

-- Create policy allowing supervisors to view their owner's workers
CREATE POLICY "Supervisors can view owner workers"
ON public.workers FOR SELECT
USING (
  -- Workers owned by the supervisor themselves
  owner_id = auth.uid()
  OR
  -- Workers owned by the supervisor's parent owner
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'supervisor'
    AND profiles.owner_id = workers.owner_id
  )
);

-- Add comment for documentation
COMMENT ON POLICY "Supervisors can view owner workers" ON public.workers IS
'Allows supervisors to view workers owned by themselves or their parent owner. This enables supervisors to assign workers to projects.';
