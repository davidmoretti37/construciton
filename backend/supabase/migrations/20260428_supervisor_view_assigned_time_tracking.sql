-- Allow assigned supervisors to read time_tracking rows for any worker on
-- a project where projects.assigned_supervisor_id = auth.uid(). Without this,
-- the WorkerDetailHistoryScreen renders blank for supervisors viewing a
-- worker the OWNER created (workers.owner_id = owner, not supervisor) — the
-- screen's data fetches all 404 silently under existing RLS.

CREATE POLICY "Assigned supervisors can view worker time tracking"
ON public.time_tracking FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = time_tracking.project_id
      AND p.assigned_supervisor_id = auth.uid()
  )
);

-- Same logic for editing — supervisors with can_manage_workers should be
-- able to edit clock-in/out records on their assigned projects (the
-- WorkerDetailHistoryScreen uses TimeEditModal which UPDATEs time_tracking).
CREATE POLICY "Assigned supervisors with permission can edit worker time"
ON public.time_tracking FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.profiles sup ON sup.id = p.assigned_supervisor_id
    WHERE p.id = time_tracking.project_id
      AND p.assigned_supervisor_id = auth.uid()
      AND sup.can_manage_workers = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.profiles sup ON sup.id = p.assigned_supervisor_id
    WHERE p.id = time_tracking.project_id
      AND p.assigned_supervisor_id = auth.uid()
      AND sup.can_manage_workers = true
  )
);
