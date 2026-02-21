-- Fix RLS policy for owners to include WITH CHECK clause
-- This allows UPDATE operations on projects owned by the user
--
-- ISSUE: The "Owners can manage own projects" policy was missing the WITH CHECK clause
-- This caused all UPDATE operations to be rejected by PostgreSQL RLS, even though
-- the USING clause allowed the user to see the rows.
--
-- PostgreSQL RLS requires:
-- - USING clause: determines which rows are visible (for SELECT, UPDATE, DELETE)
-- - WITH CHECK clause: validates new/modified rows (for INSERT, UPDATE)
--
-- Without WITH CHECK, UPDATE operations are rejected as a security precaution.

-- Drop the broken policy
DROP POLICY IF EXISTS "Owners can manage own projects" ON public.projects;

-- Recreate with proper USING and WITH CHECK clauses
CREATE POLICY "Owners can manage own projects"
ON public.projects FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Add comment explaining the policy
COMMENT ON POLICY "Owners can manage own projects" ON public.projects IS
  'Allows project owners to view, create, update, and delete their own projects. Both USING and WITH CHECK ensure the user_id matches for all operations.';
