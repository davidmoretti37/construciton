-- Link daily_reports, project_documents, and estimates to service plans
-- so service plan detail can show all the same sections as project detail

ALTER TABLE public.daily_reports ADD COLUMN IF NOT EXISTS service_plan_id UUID REFERENCES public.service_plans(id) ON DELETE CASCADE;
ALTER TABLE public.project_documents ADD COLUMN IF NOT EXISTS service_plan_id UUID REFERENCES public.service_plans(id) ON DELETE CASCADE;
ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS service_plan_id UUID REFERENCES public.service_plans(id) ON DELETE CASCADE;

-- Make project_id nullable on daily_reports (can belong to service plan instead)
DO $$ BEGIN
  ALTER TABLE public.daily_reports ALTER COLUMN project_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Add service_plan_id to project_assignments for worker assignments
ALTER TABLE public.project_assignments ADD COLUMN IF NOT EXISTS service_plan_id UUID REFERENCES public.service_plans(id) ON DELETE CASCADE;

DO $$ BEGIN
  ALTER TABLE public.project_assignments ALTER COLUMN project_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Drop the unique constraint that requires project_id, add a new one
DO $$ BEGIN
  ALTER TABLE public.project_assignments DROP CONSTRAINT IF EXISTS project_assignments_project_id_worker_id_key;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Add unique constraint for service plan assignments
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_assignments_service_plan_worker
  ON public.project_assignments(service_plan_id, worker_id)
  WHERE service_plan_id IS NOT NULL;

-- Indexes for service plan lookups
CREATE INDEX IF NOT EXISTS idx_daily_reports_service_plan ON public.daily_reports(service_plan_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_service_plan ON public.project_documents(service_plan_id);
CREATE INDEX IF NOT EXISTS idx_estimates_service_plan ON public.estimates(service_plan_id);
CREATE INDEX IF NOT EXISTS idx_project_assignments_service_plan ON public.project_assignments(service_plan_id);
