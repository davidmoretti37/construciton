-- Add project-mode support to service plans
-- Allows service plans to function as projects with phases, timelines, and progress

-- Plan mode: 'recurring' (no end date, visit-based) or 'project' (has end date, phases, progress)
ALTER TABLE public.service_plans ADD COLUMN IF NOT EXISTS plan_mode TEXT DEFAULT 'recurring';

-- Project-mode fields
ALTER TABLE public.service_plans ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE public.service_plans ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE public.service_plans ADD COLUMN IF NOT EXISTS contract_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.service_plans ADD COLUMN IF NOT EXISTS overall_progress INTEGER DEFAULT 0;
ALTER TABLE public.service_plans ADD COLUMN IF NOT EXISTS has_phases BOOLEAN DEFAULT false;
ALTER TABLE public.service_plans ADD COLUMN IF NOT EXISTS working_days TEXT[] DEFAULT ARRAY['monday','tuesday','wednesday','thursday','friday'];

-- Client contact fields (direct on plan, not just via client_id FK)
ALTER TABLE public.service_plans ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE public.service_plans ADD COLUMN IF NOT EXISTS client_phone TEXT;
ALTER TABLE public.service_plans ADD COLUMN IF NOT EXISTS client_email TEXT;
ALTER TABLE public.service_plans ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.service_plans ADD COLUMN IF NOT EXISTS task_description TEXT;

-- Allow project_phases to belong to service plans (for project-mode)
ALTER TABLE public.project_phases ADD COLUMN IF NOT EXISTS service_plan_id UUID REFERENCES public.service_plans(id) ON DELETE CASCADE;

-- Make project_id nullable on phases so they can belong to service plans instead
-- (Check if constraint exists first — some setups may not have NOT NULL)
DO $$
BEGIN
  ALTER TABLE public.project_phases ALTER COLUMN project_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Already nullable or doesn't exist
END $$;

-- Allow recurring_task templates to belong to service plans
ALTER TABLE public.project_recurring_tasks ADD COLUMN IF NOT EXISTS service_plan_id UUID REFERENCES public.service_plans(id) ON DELETE CASCADE;

DO $$
BEGIN
  ALTER TABLE public.project_recurring_tasks ALTER COLUMN project_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
