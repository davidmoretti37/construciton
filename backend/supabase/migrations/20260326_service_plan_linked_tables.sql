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

-- Indexes for service plan lookups
CREATE INDEX IF NOT EXISTS idx_daily_reports_service_plan ON public.daily_reports(service_plan_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_service_plan ON public.project_documents(service_plan_id);
CREATE INDEX IF NOT EXISTS idx_estimates_service_plan ON public.estimates(service_plan_id);
