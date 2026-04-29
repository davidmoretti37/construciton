-- =====================================================
-- AUTO-SYNC WORKER TASKS → PROJECT PHASES
-- Created: 2026-04-30
-- Purpose: When a worker marks a task complete in worker_tasks, propagate
--          that status into project_phases.tasks JSONB so the client portal
--          (which reads from JSONB) stays in sync.
--
-- Also fixes the stale-read bug in auto_update_phase_completion: the
-- existing function read tasks `FROM project_phases WHERE id = phase_id`
-- which returns OLD data inside a BEFORE UPDATE trigger. Now reads
-- NEW.tasks directly.
-- =====================================================

-- =====================================================
-- 1. Fix auto_update_phase_completion to read NEW.tasks
-- =====================================================
CREATE OR REPLACE FUNCTION public.auto_update_phase_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_total INT;
  v_done INT;
  v_pct INT;
BEGIN
  v_total := jsonb_array_length(COALESCE(NEW.tasks, '[]'::jsonb));

  IF v_total = 0 THEN
    -- No tasks → leave whatever the caller set on NEW.completion_percentage
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_done
    FROM jsonb_array_elements(NEW.tasks) AS task
    WHERE COALESCE((task->>'completed')::boolean, false);

  v_pct := ROUND(100.0 * v_done / v_total)::INT;

  -- Only update completion_percentage if it would actually change
  IF v_pct IS DISTINCT FROM NEW.completion_percentage THEN
    NEW.completion_percentage := v_pct;
  END IF;

  -- Auto-complete if all tasks done
  IF v_pct = 100 AND NEW.status IS DISTINCT FROM 'completed' THEN
    NEW.status := 'completed';
    NEW.actual_end_date := COALESCE(NEW.actual_end_date, CURRENT_DATE);
  END IF;

  -- Auto-flip not_started → in_progress when work begins
  IF v_pct > 0 AND v_pct < 100 AND NEW.status = 'not_started' THEN
    NEW.status := 'in_progress';
    NEW.actual_start_date := COALESCE(NEW.actual_start_date, CURRENT_DATE);
  END IF;

  -- If all tasks were UNCHECKED back to incomplete, optionally revert
  -- the auto-completed status. Only revert if we previously auto-set it.
  IF v_pct < 100 AND NEW.status = 'completed' AND OLD.status = 'completed' THEN
    -- Don't revert manually-marked-completed phases — only revert if
    -- the prior completion_percentage was 100 too. (Prevents thrashing.)
    IF OLD.completion_percentage = 100 THEN
      NEW.status := CASE WHEN v_pct > 0 THEN 'in_progress' ELSE 'not_started' END;
      NEW.actual_end_date := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.auto_update_phase_completion IS
  'BEFORE UPDATE trigger: recomputes completion_percentage from NEW.tasks and auto-promotes status. Reads NEW directly to avoid stale data inside the same transaction.';

-- =====================================================
-- 2. Sync worker_tasks → project_phases.tasks
-- =====================================================
CREATE OR REPLACE FUNCTION public.sync_phase_task_from_worker_task()
RETURNS TRIGGER AS $$
DECLARE
  v_phase_name TEXT;
  v_task_index INT;
  v_dash_pos INT;
  v_is_complete BOOLEAN;
  v_phase_id UUID;
  v_tasks JSONB;
BEGIN
  -- Skip if no project or phase link
  IF NEW.phase_task_id IS NULL OR NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- On UPDATE: skip if status didn't actually change
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Parse phase_task_id format: "<phase_name>-<index>"
  -- Phase names may contain dashes (e.g. "Rough-In Plumbing") so we split
  -- on the LAST dash. position(... in reverse(...)) finds the last
  -- occurrence (1-indexed from the right).
  v_dash_pos := length(NEW.phase_task_id)
                - position('-' IN reverse(NEW.phase_task_id))
                + 1;
  IF v_dash_pos < 2 OR v_dash_pos >= length(NEW.phase_task_id) THEN
    RETURN NEW; -- malformed
  END IF;

  v_phase_name := substring(NEW.phase_task_id, 1, v_dash_pos - 1);

  BEGIN
    v_task_index := substring(NEW.phase_task_id, v_dash_pos + 1)::INT;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW; -- non-integer suffix
  END;

  v_is_complete := NEW.status = 'completed';

  -- Find the matching phase
  SELECT id, tasks INTO v_phase_id, v_tasks
    FROM public.project_phases
    WHERE project_id = NEW.project_id
      AND name = v_phase_name
    LIMIT 1;

  IF v_phase_id IS NULL OR v_tasks IS NULL THEN
    RETURN NEW;
  END IF;

  IF jsonb_array_length(v_tasks) <= v_task_index THEN
    RETURN NEW; -- index out of bounds
  END IF;

  -- Patch the task at v_task_index: set completed + status
  UPDATE public.project_phases
    SET tasks = jsonb_set(
                  jsonb_set(
                    tasks,
                    ARRAY[v_task_index::TEXT, 'completed'],
                    to_jsonb(v_is_complete),
                    true
                  ),
                  ARRAY[v_task_index::TEXT, 'status'],
                  CASE WHEN v_is_complete
                       THEN '"done"'::jsonb
                       ELSE '"not_started"'::jsonb
                  END,
                  true
                )
    WHERE id = v_phase_id;
  -- The BEFORE UPDATE trigger auto_update_phase_completion (just fixed
  -- above) will recompute completion_percentage and auto-promote status.

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.sync_phase_task_from_worker_task IS
  'Propagates worker_tasks status changes into project_phases.tasks JSONB. Fires after a worker checks/unchecks a task so the client portal (which reads from JSONB) stays in sync without manual intervention.';

DROP TRIGGER IF EXISTS trg_sync_phase_task_from_worker_task ON public.worker_tasks;
CREATE TRIGGER trg_sync_phase_task_from_worker_task
  AFTER INSERT OR UPDATE OF status ON public.worker_tasks
  FOR EACH ROW EXECUTE FUNCTION public.sync_phase_task_from_worker_task();

-- =====================================================
-- 3. One-time backfill: re-sync ALL existing phases from worker_tasks.
-- This catches every project, not just the test one.
-- =====================================================
DO $$
DECLARE
  v_phase RECORD;
  v_new_tasks JSONB;
BEGIN
  FOR v_phase IN
    SELECT id, project_id, name, tasks
      FROM public.project_phases
     WHERE jsonb_array_length(COALESCE(tasks, '[]'::jsonb)) > 0
  LOOP
    -- Build a new tasks array, flipping completed/status based on worker_tasks
    SELECT jsonb_agg(
      CASE
        WHEN wt.status = 'completed' THEN
          jsonb_set(
            jsonb_set(t, '{completed}', 'true'::jsonb, true),
            '{status}', '"done"'::jsonb, true
          )
        ELSE t
      END
      ORDER BY ord
    ) INTO v_new_tasks
    FROM jsonb_array_elements(v_phase.tasks) WITH ORDINALITY AS arr(t, ord)
    LEFT JOIN public.worker_tasks wt
      ON wt.project_id = v_phase.project_id
     AND wt.phase_task_id = v_phase.name || '-' || (ord - 1);

    UPDATE public.project_phases
       SET tasks = v_new_tasks
     WHERE id = v_phase.id;
    -- BEFORE trigger recalculates completion_percentage + status from NEW.tasks
  END LOOP;
END $$;
