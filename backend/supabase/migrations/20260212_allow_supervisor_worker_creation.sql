-- =====================================================
-- Allow Supervisors to Create Workers
-- Created: 2026-02-12
-- Purpose: Enable supervisors to add workers to their team
-- =====================================================

-- Drop existing restrictive policy if it exists
DROP POLICY IF EXISTS "Owners can create workers" ON public.workers;

-- Recreate policy to allow BOTH owners AND supervisors
CREATE POLICY "Owners and supervisors can create workers"
ON public.workers FOR INSERT
WITH CHECK (
  -- Owner creating a worker for themselves
  owner_id = auth.uid()
  OR
  -- Supervisor creating a worker (supervisor's owner_id points to parent owner)
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'supervisor'
    AND profiles.owner_id = workers.owner_id
  )
);

-- Grant permissions to authenticated users
GRANT ALL ON public.workers TO authenticated;
