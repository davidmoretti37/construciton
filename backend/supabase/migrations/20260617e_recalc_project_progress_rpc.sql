-- ============================================================================
-- 20260617e_recalc_project_progress_rpc.sql
--
-- Workers (and supervisors) can mark worker_tasks complete, but the only write
-- policy on public.projects is projects_owner_write (user_id = auth.uid()).
-- As a result, the frontend's updateProjectProgressFromTasks() projects.update
-- run through a worker's session affects 0 rows SILENTLY: the owner's progress
-- bar never reflects worker task completions.
--
-- Fix: a SECURITY DEFINER RPC that recomputes projects.actual_progress from
-- worker_tasks, gated by user_can_access_project() so only someone with access
-- to the project can trigger it (no security hole — same access surface as the
-- existing projects_read / worker_tasks policies).
--
-- The progress formula MUST match the JS in
--   frontend/src/utils/storage/workerTasks.js
--   (calculateProjectProgressFromTasks):
--     total     = count of all worker_tasks for the project
--     completed = count of worker_tasks with status = 'completed'
--     progress  = round((completed / total) * 100)   -- 0 when total = 0
-- and progress_override is set to false (always task-based progress).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recalc_project_progress(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total     integer;
  v_completed integer;
  v_progress  integer;
BEGIN
  -- Access gate: only someone who can access the project may trigger a recalc.
  IF NOT public.user_can_access_project(p_project_id) THEN
    RETURN;
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE status = 'completed')
  INTO v_total, v_completed
  FROM public.worker_tasks
  WHERE project_id = p_project_id;

  -- Match JS: 0 when there are no tasks; otherwise round((completed/total)*100).
  IF v_total = 0 THEN
    v_progress := 0;
  ELSE
    v_progress := round((v_completed::numeric / v_total::numeric) * 100);
  END IF;

  UPDATE public.projects
  SET actual_progress   = v_progress,
      progress_override = false
  WHERE id = p_project_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recalc_project_progress(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalc_project_progress(uuid) TO authenticated;
