-- Recurring task templates (attached to a project/phase)
CREATE TABLE IF NOT EXISTS public.project_recurring_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES public.project_phases(id) ON DELETE SET NULL,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  requires_quantity BOOLEAN DEFAULT false,
  quantity_unit TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Daily log entries (one per task per day per worker)
CREATE TABLE IF NOT EXISTS public.recurring_task_daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_task_id UUID NOT NULL REFERENCES public.project_recurring_tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed BOOLEAN DEFAULT false,
  quantity NUMERIC(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(recurring_task_id, worker_id, log_date)
);

CREATE INDEX IF NOT EXISTS recurring_tasks_project_idx
  ON public.project_recurring_tasks(project_id);
CREATE INDEX IF NOT EXISTS daily_logs_project_date_idx
  ON public.recurring_task_daily_logs(project_id, log_date);
