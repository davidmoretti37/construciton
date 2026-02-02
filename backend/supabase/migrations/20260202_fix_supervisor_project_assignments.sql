-- =====================================================
-- FIX SUPERVISOR RLS POLICIES
-- Addresses gaps where supervisors couldn't:
-- 1. Assign workers to projects
-- 2. Submit daily reports
-- =====================================================

-- ===================
-- PROJECT_ASSIGNMENTS
-- ===================

-- Supervisors can manage worker assignments on projects assigned to them
CREATE POLICY "Supervisors can manage worker assignments on assigned projects"
ON public.project_assignments FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_assignments.project_id
    AND projects.assigned_supervisor_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_assignments.project_id
    AND projects.assigned_supervisor_id = auth.uid()
  )
);

-- Also allow supervisors to manage assignments for their own workers
-- (in case the supervisor created the worker directly)
CREATE POLICY "Supervisors can assign their own workers"
ON public.project_assignments FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.workers
    WHERE workers.id = project_assignments.worker_id
    AND workers.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workers
    WHERE workers.id = project_assignments.worker_id
    AND workers.owner_id = auth.uid()
  )
);

-- ===================
-- DAILY_REPORTS
-- ===================

-- Supervisors can insert daily reports on projects assigned to them
CREATE POLICY "Supervisors can insert daily reports on assigned projects"
ON public.daily_reports FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_id
    AND projects.assigned_supervisor_id = auth.uid()
  )
);

-- Supervisors can update their own daily reports
CREATE POLICY "Supervisors can update their daily reports"
ON public.daily_reports FOR UPDATE
TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_id
    AND projects.assigned_supervisor_id = auth.uid()
  )
);

-- Supervisors can delete their own daily reports
CREATE POLICY "Supervisors can delete their daily reports"
ON public.daily_reports FOR DELETE
TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_id
    AND projects.assigned_supervisor_id = auth.uid()
  )
);
