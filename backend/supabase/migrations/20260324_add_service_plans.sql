-- Service Plans System
-- Adds 8 tables for recurring service management (pest control, cleaning, landscaping, etc.)

-- ============================================================
-- 1. service_plans
-- ============================================================
CREATE TABLE IF NOT EXISTS public.service_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  service_type TEXT NOT NULL CHECK (service_type IN ('pest_control','cleaning','landscaping','pool_service','lawn_care','hvac','other')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('per_visit','monthly','quarterly')),
  price_per_visit NUMERIC(10,2),
  monthly_rate NUMERIC(10,2),
  currency TEXT NOT NULL DEFAULT 'USD',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. service_locations
-- ============================================================
CREATE TABLE IF NOT EXISTS public.service_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_plan_id UUID NOT NULL REFERENCES public.service_plans(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  formatted_address TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  place_id TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  access_notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_locations_plan_active
  ON public.service_locations(service_plan_id, is_active);

-- ============================================================
-- 3. location_schedules
-- ============================================================
CREATE TABLE IF NOT EXISTS public.location_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_location_id UUID NOT NULL REFERENCES public.service_locations(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly','biweekly','monthly','custom')),
  scheduled_days TEXT[] DEFAULT '{}',
  day_of_month INTEGER CHECK (day_of_month BETWEEN 1 AND 31),
  preferred_time TIME,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 4. visit_checklist_templates
-- ============================================================
CREATE TABLE IF NOT EXISTS public.visit_checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_location_id UUID NOT NULL REFERENCES public.service_locations(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  requires_photo BOOLEAN NOT NULL DEFAULT false,
  requires_quantity BOOLEAN NOT NULL DEFAULT false,
  quantity_unit TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. service_routes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.service_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  route_date DATE NOT NULL,
  assigned_worker_id UUID REFERENCES public.workers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_routes_owner_date
  ON public.service_routes(owner_id, route_date);

-- ============================================================
-- 6. service_visits
-- ============================================================
CREATE TABLE IF NOT EXISTS public.service_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_plan_id UUID NOT NULL REFERENCES public.service_plans(id) ON DELETE CASCADE,
  service_location_id UUID NOT NULL REFERENCES public.service_locations(id),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_worker_id UUID REFERENCES public.workers(id) ON DELETE SET NULL,
  route_id UUID REFERENCES public.service_routes(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','skipped','cancelled')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  worker_notes TEXT,
  owner_notes TEXT,
  photos JSONB NOT NULL DEFAULT '[]',
  billable BOOLEAN NOT NULL DEFAULT true,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  generated_from_schedule_id UUID REFERENCES public.location_schedules(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_visits_owner_date
  ON public.service_visits(owner_id, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_service_visits_worker_date_status
  ON public.service_visits(assigned_worker_id, scheduled_date, status);

CREATE INDEX IF NOT EXISTS idx_service_visits_plan_status_billable
  ON public.service_visits(service_plan_id, status, billable);

CREATE INDEX IF NOT EXISTS idx_service_visits_invoice
  ON public.service_visits(invoice_id) WHERE invoice_id IS NOT NULL;

-- ============================================================
-- 7. route_stops
-- ============================================================
CREATE TABLE IF NOT EXISTS public.route_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES public.service_routes(id) ON DELETE CASCADE,
  service_visit_id UUID NOT NULL REFERENCES public.service_visits(id) ON DELETE CASCADE,
  stop_order INTEGER NOT NULL,
  estimated_arrival TIME,
  actual_arrival TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (route_id, service_visit_id),
  UNIQUE (route_id, stop_order)
);

-- ============================================================
-- 8. visit_checklist_items
-- ============================================================
CREATE TABLE IF NOT EXISTS public.visit_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_visit_id UUID NOT NULL REFERENCES public.service_visits(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.visit_checklist_templates(id) ON DELETE SET NULL,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.workers(id) ON DELETE SET NULL,
  quantity NUMERIC(10,2),
  quantity_unit TEXT,
  photo_url TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_visit_checklist_items_visit
  ON public.visit_checklist_items(service_visit_id);

-- ============================================================
-- Triggers: auto-update updated_at
-- ============================================================
DROP TRIGGER IF EXISTS update_service_plans_updated_at ON public.service_plans;
CREATE TRIGGER update_service_plans_updated_at
  BEFORE UPDATE ON public.service_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_service_routes_updated_at ON public.service_routes;
CREATE TRIGGER update_service_routes_updated_at
  BEFORE UPDATE ON public.service_routes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_service_visits_updated_at ON public.service_visits;
CREATE TRIGGER update_service_visits_updated_at
  BEFORE UPDATE ON public.service_visits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
