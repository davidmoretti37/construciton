-- Add indexes on hot-path filter columns that were triggering
-- statement_timeout (57014) errors on ProjectDetailView open and owner
-- project list loads. Each query below was previously a seq scan on
-- unindexed FKs / status columns.
--
-- Safe to re-run: every index uses IF NOT EXISTS.
--
-- Each CREATE INDEX briefly locks writes on the table while the index
-- builds. For these tables at current scale that's a sub-second operation.
-- If the tables have grown much larger by the time this runs, swap to
-- CREATE INDEX CONCURRENTLY and apply them one at a time outside a
-- transaction (e.g. via the Supabase SQL editor).

-- worker_tasks: "Error fetching tasks for progress"
-- The table had no indexes at all. Every per-project task load filtered
-- on project_id; often combined with .is('phase_task_id', null) or status
-- checks. These three cover the hot paths. (Worker assignment lives on
-- project_phases.assigned_worker_id — worker_tasks has no worker_id.)
CREATE INDEX IF NOT EXISTS idx_worker_tasks_project_id
  ON public.worker_tasks(project_id);

CREATE INDEX IF NOT EXISTS idx_worker_tasks_phase_task_id
  ON public.worker_tasks(phase_task_id);

CREATE INDEX IF NOT EXISTS idx_worker_tasks_status
  ON public.worker_tasks(status);

-- projects: "Error fetching projects for owner" / supervisor list
CREATE INDEX IF NOT EXISTS idx_projects_user_id
  ON public.projects(user_id);

CREATE INDEX IF NOT EXISTS idx_projects_assigned_supervisor_id
  ON public.projects(assigned_supervisor_id);

CREATE INDEX IF NOT EXISTS idx_projects_status
  ON public.projects(status);

-- Compound indexes for the common list queries
--   .eq('user_id', X).in('status', ['active', 'scheduled'])
--   .eq('assigned_supervisor_id', X).in('status', [...])
-- Let Postgres satisfy the filter with a single index scan.
CREATE INDEX IF NOT EXISTS idx_projects_user_status
  ON public.projects(user_id, status);

CREATE INDEX IF NOT EXISTS idx_projects_supervisor_status
  ON public.projects(assigned_supervisor_id, status);
