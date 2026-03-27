-- ============================================================
-- Daily Checklist System
-- Replaces project_recurring_tasks + recurring_task_daily_logs
-- with a flexible checklist + labor roles system that works
-- for both projects and service plans.
-- ============================================================

-- ============================================================
-- 1. DROP OLD TABLES
-- ============================================================

DROP TABLE IF EXISTS public.recurring_task_daily_logs CASCADE;
DROP TABLE IF EXISTS public.project_recurring_tasks CASCADE;

-- ============================================================
-- 2. DROP plan_mode FROM service_plans
--    No longer needed — daily checklist is an optional add-on,
--    not a separate plan type.
-- ============================================================

ALTER TABLE public.service_plans DROP COLUMN IF EXISTS plan_mode;

-- ============================================================
-- 3. DAILY CHECKLIST TEMPLATES
--    Per-project or per-service-plan checklist items.
--    Owner defines these once; they pre-populate every daily report.
--    If specific_date is set, the item only appears on that date
--    (one-off items, e.g. "add chlorine next Monday").
-- ============================================================

CREATE TABLE IF NOT EXISTS public.daily_checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  service_plan_id UUID REFERENCES public.service_plans(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'checkbox',  -- 'checkbox' or 'quantity'
  quantity_unit TEXT,                           -- e.g. 'feet', 'bags', 'gallons'
  requires_photo BOOLEAN DEFAULT false,
  specific_date DATE,                          -- NULL = every day, set = only that date
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT checklist_parent_check CHECK (
    (project_id IS NOT NULL AND service_plan_id IS NULL) OR
    (project_id IS NULL AND service_plan_id IS NOT NULL)
  ),
  CONSTRAINT checklist_item_type_check CHECK (item_type IN ('checkbox', 'quantity'))
);

-- ============================================================
-- 4. LABOR ROLE TEMPLATES
--    Per-project or per-service-plan labor roles.
--    Owner defines roles like "Fiber Splicer", "Laborer", etc.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.labor_role_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  service_plan_id UUID REFERENCES public.service_plans(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL,
  default_quantity INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT labor_parent_check CHECK (
    (project_id IS NOT NULL AND service_plan_id IS NULL) OR
    (project_id IS NULL AND service_plan_id IS NOT NULL)
  )
);

-- ============================================================
-- 5. DAILY SERVICE REPORTS
--    One per day per project/service-plan per reporter.
--    The "envelope" that holds checklist entries and labor
--    counts for that day.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.daily_service_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  service_plan_id UUID REFERENCES public.service_plans(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  photos JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT report_parent_check CHECK (
    (project_id IS NOT NULL AND service_plan_id IS NULL) OR
    (project_id IS NULL AND service_plan_id IS NOT NULL)
  )
);

-- Unique constraints: one report per day per reporter per parent
-- Using partial unique indexes since only one parent column is non-null
CREATE UNIQUE INDEX IF NOT EXISTS daily_reports_project_unique
  ON public.daily_service_reports(project_id, report_date, reporter_id)
  WHERE project_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS daily_reports_plan_unique
  ON public.daily_service_reports(service_plan_id, report_date, reporter_id)
  WHERE service_plan_id IS NOT NULL;

-- ============================================================
-- 6. DAILY REPORT ENTRIES
--    Individual line items within a daily report.
--    Two types: 'checklist' (task completion) and 'labor' (role headcount).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.daily_report_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.daily_service_reports(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL,  -- 'checklist' or 'labor'
  -- For checklist entries: links to template
  checklist_template_id UUID REFERENCES public.daily_checklist_templates(id) ON DELETE SET NULL,
  -- For labor entries: links to role template
  labor_template_id UUID REFERENCES public.labor_role_templates(id) ON DELETE SET NULL,
  -- Shared fields
  title TEXT NOT NULL,       -- denormalized from template for history
  completed BOOLEAN DEFAULT false,
  quantity NUMERIC(10,2),
  quantity_unit TEXT,
  photo_url TEXT,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT entry_type_check CHECK (entry_type IN ('checklist', 'labor'))
);

-- ============================================================
-- 7. INDEXES
-- ============================================================

-- Checklist templates
CREATE INDEX IF NOT EXISTS checklist_templates_project_idx
  ON public.daily_checklist_templates(project_id)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS checklist_templates_plan_idx
  ON public.daily_checklist_templates(service_plan_id)
  WHERE service_plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS checklist_templates_specific_date_idx
  ON public.daily_checklist_templates(specific_date)
  WHERE specific_date IS NOT NULL;

-- Labor role templates
CREATE INDEX IF NOT EXISTS labor_templates_project_idx
  ON public.labor_role_templates(project_id)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS labor_templates_plan_idx
  ON public.labor_role_templates(service_plan_id)
  WHERE service_plan_id IS NOT NULL;

-- Daily service reports
CREATE INDEX IF NOT EXISTS service_reports_project_date_idx
  ON public.daily_service_reports(project_id, report_date)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_reports_plan_date_idx
  ON public.daily_service_reports(service_plan_id, report_date)
  WHERE service_plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_reports_reporter_idx
  ON public.daily_service_reports(reporter_id);

-- Report entries
CREATE INDEX IF NOT EXISTS report_entries_report_idx
  ON public.daily_report_entries(report_id);

-- ============================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.daily_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_role_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_service_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_report_entries ENABLE ROW LEVEL SECURITY;

-- Checklist templates: owner can CRUD
CREATE POLICY checklist_templates_owner ON public.daily_checklist_templates
  FOR ALL USING (owner_id = auth.uid());

-- Labor role templates: owner can CRUD
CREATE POLICY labor_templates_owner ON public.labor_role_templates
  FOR ALL USING (owner_id = auth.uid());

-- Daily service reports: owner can view all, reporter can CRUD their own
CREATE POLICY service_reports_owner ON public.daily_service_reports
  FOR ALL USING (owner_id = auth.uid());
CREATE POLICY service_reports_reporter ON public.daily_service_reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid());
CREATE POLICY service_reports_reporter_update ON public.daily_service_reports
  FOR UPDATE USING (reporter_id = auth.uid());
CREATE POLICY service_reports_reporter_select ON public.daily_service_reports
  FOR SELECT USING (reporter_id = auth.uid());

-- Report entries: accessible if you can access the parent report
CREATE POLICY report_entries_via_report ON public.daily_report_entries
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.daily_service_reports r
      WHERE r.id = report_id
      AND (r.owner_id = auth.uid() OR r.reporter_id = auth.uid())
    )
  );
