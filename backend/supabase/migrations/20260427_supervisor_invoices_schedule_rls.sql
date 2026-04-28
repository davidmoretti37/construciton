-- =====================================================
-- Supervisor RLS for invoices and schedule_events
-- =====================================================
-- Existing policies on these two tables only allowed `auth.uid() = user_id`
-- (or owner_id). Supervisors had no path to read invoices linked to their
-- assigned projects or schedule events tied to those projects, so list
-- screens (Settings → Invoices, the supervisor's calendar) returned empty.
-- =====================================================

DROP POLICY IF EXISTS invoices_supervisor_read ON public.invoices;
CREATE POLICY invoices_supervisor_read
  ON public.invoices
  FOR SELECT
  USING (
    project_id IS NOT NULL
    AND project_id IN (
      SELECT id FROM projects WHERE assigned_supervisor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS schedule_events_supervisor ON public.schedule_events;
CREATE POLICY schedule_events_supervisor
  ON public.schedule_events
  FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE assigned_supervisor_id = auth.uid()
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects WHERE assigned_supervisor_id = auth.uid()
    )
  );
