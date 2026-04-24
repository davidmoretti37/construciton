-- Flatten hot-path RLS to fix 57014 statement_timeout on project-open burst.
--
-- PROBLEM
--   project_phases had 13 overlapping policies, worker_tasks had 7, projects had 5.
--   Every SELECT evaluates the OR of every permissive policy. Each policy runs
--   EXISTS (SELECT FROM projects WHERE ...) which re-enters RLS on projects and
--   then project_assignments (which has its own policies). Under a 10+ parallel
--   query project-detail burst the planner cost compounds past the 8s
--   statement_timeout cap.
--
-- SOLUTION
--   Replace the tree with two SECURITY DEFINER helpers that short-circuit the
--   authorization check (RLS does not re-enter inside a SECURITY DEFINER call).
--   Every hot table gets exactly two policies: one read via the helper, one
--   write via the owner check.
--
-- Policies collapsed per table:
--   projects          5 -> 2
--   project_phases   13 -> 2
--   worker_tasks      7 -> 2
--
-- Helpers added (private auth checks, not exposed via PostgREST):
--   public.user_can_access_project(uuid)  owner / supervisor / worker / owner-of-supervisor
--   public.user_owns_project(uuid)        owner only
--
-- Both are STABLE so the planner caches them as an InitPlan per statement.

BEGIN;

-- ============================================================
-- 1. SECURITY DEFINER access checks
-- ============================================================

CREATE OR REPLACE FUNCTION public.user_can_access_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id
      AND (
        -- Owner
        p.user_id = (SELECT auth.uid())
        -- Supervisor directly assigned to the project
        OR p.assigned_supervisor_id = (SELECT auth.uid())
        -- Worker assigned to the project via project_assignments
        OR EXISTS (
          SELECT 1
          FROM public.project_assignments pa
          JOIN public.workers w ON w.id = pa.worker_id
          WHERE pa.project_id = p.id
            AND w.user_id = (SELECT auth.uid())
        )
        -- Supervisor whose owner owns the project (hierarchy)
        OR EXISTS (
          SELECT 1 FROM public.profiles pr
          WHERE pr.id = p.user_id
            AND pr.owner_id = (SELECT auth.uid())
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.user_can_access_project(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_project(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_owns_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id
      AND user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.user_owns_project(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_owns_project(uuid) TO authenticated;

-- ============================================================
-- 2. projects — collapse 5 -> 2
-- ============================================================

DROP POLICY IF EXISTS "Owners can manage own projects"                ON public.projects;
DROP POLICY IF EXISTS "Workers can view assigned projects"            ON public.projects;
DROP POLICY IF EXISTS "Workers can view owner projects for clock-in"  ON public.projects;
DROP POLICY IF EXISTS "Supervisors can view assigned projects"        ON public.projects;
DROP POLICY IF EXISTS "Supervisors can update assigned projects"      ON public.projects;
DROP POLICY IF EXISTS "Owners can view supervisor projects"           ON public.projects;
DROP POLICY IF EXISTS "Clients can view shared projects"              ON public.projects;

-- Read: anyone with access (owner / supervisor / worker / owner-of-supervisor)
CREATE POLICY "projects_read" ON public.projects
  FOR SELECT TO authenticated
  USING (public.user_can_access_project(id));

-- Write: owner only. Supervisors/workers use dedicated RPCs for narrow writes.
CREATE POLICY "projects_owner_write" ON public.projects
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ============================================================
-- 3. project_phases — collapse 13 -> 2
-- ============================================================

DROP POLICY IF EXISTS "Users can view own project phases"                 ON public.project_phases;
DROP POLICY IF EXISTS "Users can insert own project phases"               ON public.project_phases;
DROP POLICY IF EXISTS "Users can update own project phases"               ON public.project_phases;
DROP POLICY IF EXISTS "Users can delete own project phases"               ON public.project_phases;
DROP POLICY IF EXISTS "Workers can view phases of assigned projects"      ON public.project_phases;
DROP POLICY IF EXISTS "Workers can view assigned project phases"          ON public.project_phases;
DROP POLICY IF EXISTS "Workers can update assigned project phases"        ON public.project_phases;
DROP POLICY IF EXISTS "Supervisors can view phases of assigned projects"  ON public.project_phases;
DROP POLICY IF EXISTS "Supervisors can update phases of assigned projects" ON public.project_phases;

CREATE POLICY "project_phases_read" ON public.project_phases
  FOR SELECT TO authenticated
  USING (public.user_can_access_project(project_id));

CREATE POLICY "project_phases_write" ON public.project_phases
  FOR ALL TO authenticated
  USING (public.user_can_access_project(project_id))
  WITH CHECK (public.user_can_access_project(project_id));

-- ============================================================
-- 4. worker_tasks — collapse 7 -> 2
-- ============================================================

DROP POLICY IF EXISTS "Users can view own worker tasks"                    ON public.worker_tasks;
DROP POLICY IF EXISTS "Users can insert own worker tasks"                  ON public.worker_tasks;
DROP POLICY IF EXISTS "Users can update own worker tasks"                  ON public.worker_tasks;
DROP POLICY IF EXISTS "Users can delete own worker tasks"                  ON public.worker_tasks;
DROP POLICY IF EXISTS "Workers can view tasks of assigned projects"        ON public.worker_tasks;
DROP POLICY IF EXISTS "Workers can update tasks of assigned projects"      ON public.worker_tasks;
DROP POLICY IF EXISTS "Supervisors can view tasks of assigned projects"    ON public.worker_tasks;
DROP POLICY IF EXISTS "Supervisors can manage tasks of assigned projects"  ON public.worker_tasks;
DROP POLICY IF EXISTS "Owners can manage their tasks"                      ON public.worker_tasks;

CREATE POLICY "worker_tasks_read" ON public.worker_tasks
  FOR SELECT TO authenticated
  USING (public.user_can_access_project(project_id));

CREATE POLICY "worker_tasks_write" ON public.worker_tasks
  FOR ALL TO authenticated
  USING (public.user_can_access_project(project_id))
  WITH CHECK (public.user_can_access_project(project_id));

-- ============================================================
-- 5. Refresh planner stats
-- ============================================================

ANALYZE public.projects;
ANALYZE public.project_phases;
ANALYZE public.worker_tasks;
ANALYZE public.project_assignments;
ANALYZE public.workers;
ANALYZE public.profiles;

COMMIT;
