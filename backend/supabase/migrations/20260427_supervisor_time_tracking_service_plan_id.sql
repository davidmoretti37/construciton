-- Add service_plan_id to supervisor_time_tracking so supervisors can clock in
-- to either a project or a service plan, mirroring the worker time_tracking
-- table. The original migration (20260201) shipped without this column even
-- though the frontend (supervisorClockIn, getActiveSupervisorClockIn,
-- HomeScreen) already reads/writes it, producing a PostgREST PGRST200 error.

ALTER TABLE public.supervisor_time_tracking
  ADD COLUMN IF NOT EXISTS service_plan_id UUID
    REFERENCES public.service_plans(id) ON DELETE CASCADE;

-- project_id was NOT NULL — relax it so service-plan-only clock-ins are valid.
ALTER TABLE public.supervisor_time_tracking
  ALTER COLUMN project_id DROP NOT NULL;

-- Exactly one of project_id / service_plan_id must be set per row.
ALTER TABLE public.supervisor_time_tracking
  DROP CONSTRAINT IF EXISTS supervisor_time_tracking_target_chk;

ALTER TABLE public.supervisor_time_tracking
  ADD CONSTRAINT supervisor_time_tracking_target_chk
  CHECK (
    (project_id IS NOT NULL AND service_plan_id IS NULL)
    OR (project_id IS NULL AND service_plan_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_supervisor_time_tracking_service_plan_id
  ON public.supervisor_time_tracking(service_plan_id);

NOTIFY pgrst, 'reload schema';
