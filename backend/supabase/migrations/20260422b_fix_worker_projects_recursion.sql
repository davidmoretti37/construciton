-- Fix infinite recursion (42P17) triggered by
-- 20260422_worker_view_assigned_projects.sql.
--
-- The cycle:
--   projects SELECT → policy "Workers can view assigned projects"
--     → queries project_assignments
--     → project_assignments has policy "Owners can manage worker assignments"
--       → queries projects → back to "Workers can view assigned projects" → ∞
--
-- Postgres evaluates ALL applicable permissive policies on every read, so
-- even though another project_assignments policy ("Workers can view their
-- assignments") is side-effect-free, the owner policy still triggers the
-- cycle whenever RLS resolves project_assignments rows.
--
-- Fix: move the assignment lookup into a SECURITY DEFINER helper so it
-- bypasses RLS on the inner tables. The helper is STABLE (Postgres can
-- inline it) and SET search_path = public (safe from search_path attacks).

-- Drop the recursive policy first
DROP POLICY IF EXISTS "Workers can view assigned projects" ON public.projects;

-- Helper: does the current auth.uid() have an assignment to this project?
CREATE OR REPLACE FUNCTION public.current_worker_assigned_to_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_assignments pa
    JOIN public.workers w ON w.id = pa.worker_id
    WHERE pa.project_id = p_project_id
    AND w.user_id = auth.uid()
  );
$$;

-- Lock it down: anonymous and authenticated roles can call it, but it
-- only reveals a boolean for the caller's own worker assignments.
REVOKE ALL ON FUNCTION public.current_worker_assigned_to_project(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_worker_assigned_to_project(uuid) TO authenticated, anon;

-- Re-create the policy using the helper — no recursion, same intent.
CREATE POLICY "Workers can view assigned projects"
ON public.projects FOR SELECT
USING (public.current_worker_assigned_to_project(id));
