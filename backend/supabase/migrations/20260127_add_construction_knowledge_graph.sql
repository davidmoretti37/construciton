-- =====================================================
-- CONSTRUCTION KNOWLEDGE GRAPH
-- Created: 2026-01-27
-- Purpose: Provide AI with realistic construction task
--          durations, dependencies, and scheduling rules
-- =====================================================

-- ============================================
-- 1. CONSTRUCTION TASK TEMPLATES
-- The "brain" - what tasks exist and how long they take
-- ============================================

CREATE TABLE IF NOT EXISTS public.construction_task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Task identity
  name TEXT NOT NULL,
  description TEXT,
  trade TEXT NOT NULL,  -- 'demolition', 'framing', 'electrical', 'plumbing', etc.

  -- Duration estimates (in hours)
  duration_hours_min NUMERIC NOT NULL,
  duration_hours_max NUMERIC NOT NULL,
  duration_hours_avg NUMERIC NOT NULL,

  -- Timing considerations
  drying_time_hours INTEGER DEFAULT 0,     -- Time needed after task before next can start
  lead_time_days INTEGER DEFAULT 0,        -- Advance notice needed (permits, orders)
  buffer_hours INTEGER DEFAULT 0,          -- Recommended buffer time

  -- Requirements
  is_permit_required BOOLEAN DEFAULT FALSE,
  is_inspection_required BOOLEAN DEFAULT FALSE,
  required_materials TEXT[] DEFAULT '{}',
  required_equipment TEXT[] DEFAULT '{}',

  -- Phase categorization
  phase_category TEXT CHECK (phase_category IN (
    'planning', 'demo', 'rough', 'inspection',
    'drywall', 'paint', 'flooring', 'finish', 'closeout'
  )),

  -- For project type matching
  project_types TEXT[] DEFAULT '{}',  -- ['bathroom', 'kitchen', 'basement', 'addition']

  -- Learning & confidence
  is_system_template BOOLEAN DEFAULT TRUE,  -- false for user-created
  confidence_score NUMERIC DEFAULT 1.0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  times_used INTEGER DEFAULT 0,
  times_modified INTEGER DEFAULT 0,

  -- Search
  keywords TEXT[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_task_templates_trade ON public.construction_task_templates(trade);
CREATE INDEX IF NOT EXISTS idx_task_templates_phase ON public.construction_task_templates(phase_category);
CREATE INDEX IF NOT EXISTS idx_task_templates_project_types ON public.construction_task_templates USING GIN(project_types);

-- ============================================
-- 2. TASK DEPENDENCIES
-- What must come before what
-- ============================================

CREATE TABLE IF NOT EXISTS public.task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The task that has the dependency
  task_id UUID NOT NULL REFERENCES public.construction_task_templates(id) ON DELETE CASCADE,

  -- The task it depends on (must complete first)
  depends_on_task_id UUID NOT NULL REFERENCES public.construction_task_templates(id) ON DELETE CASCADE,

  -- Dependency type
  dependency_type TEXT CHECK (dependency_type IN (
    'finish_to_start',   -- A must finish before B starts (most common)
    'start_to_start',    -- A must start before B can start
    'finish_to_finish',  -- A must finish before B can finish
    'start_to_finish'    -- A must start before B can finish (rare)
  )) DEFAULT 'finish_to_start',

  -- Lag time between tasks (hours)
  lag_hours INTEGER DEFAULT 0,  -- e.g., 24 for drywall mud drying

  -- Is this a hard rule or a recommendation?
  is_hard_constraint BOOLEAN DEFAULT TRUE,

  -- Why this dependency exists
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate dependencies
  UNIQUE(task_id, depends_on_task_id)
);

-- Indexes for dependency lookups
CREATE INDEX IF NOT EXISTS idx_dependencies_task ON public.task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_depends_on ON public.task_dependencies(depends_on_task_id);

-- ============================================
-- 3. SCHEDULING CONSTRAINTS
-- Business rules for scheduling
-- ============================================

CREATE TABLE IF NOT EXISTS public.scheduling_constraints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  description TEXT,

  -- Rule type
  rule_type TEXT CHECK (rule_type IN (
    'temporal',   -- Time-based rules (work hours, no Sundays)
    'capacity',   -- Resource limits (max hours/day)
    'calendar',   -- Calendar rules (holidays, no weekends)
    'dependency', -- Task sequencing rules
    'material'    -- Material-related (fabrication time)
  )) NOT NULL,

  -- Rule definition as flexible JSONB
  rule_definition JSONB NOT NULL,
  -- Examples:
  -- {"max_hours_per_day": 8}
  -- {"excluded_days": ["sunday"]}
  -- {"work_hours": {"start": "07:00", "end": "17:00"}}
  -- {"task_contains": "inspection", "min_lead_time_hours": 48}
  -- {"after_task_contains": "mud", "min_gap_hours": 24}

  -- Scope
  applies_to_trades TEXT[],      -- Empty = all trades
  applies_to_project_types TEXT[], -- Empty = all project types

  -- Activity
  is_active BOOLEAN DEFAULT TRUE,
  is_system_rule BOOLEAN DEFAULT TRUE,  -- false for user-created
  priority INTEGER DEFAULT 0,  -- Higher = more important

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for active rules
CREATE INDEX IF NOT EXISTS idx_constraints_active ON public.scheduling_constraints(is_active) WHERE is_active = TRUE;

-- ============================================
-- 4. TASK LEARNINGS
-- Track actual performance to improve estimates
-- ============================================

CREATE TABLE IF NOT EXISTS public.task_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What task was performed
  task_template_id UUID REFERENCES public.construction_task_templates(id) ON DELETE SET NULL,
  task_name TEXT NOT NULL,  -- Store name in case template deleted

  -- Where it was performed
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  phase_id UUID REFERENCES public.project_phases(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Duration comparison
  estimated_duration_hours NUMERIC,
  actual_duration_hours NUMERIC,
  variance_hours NUMERIC GENERATED ALWAYS AS (actual_duration_hours - estimated_duration_hours) STORED,
  variance_percent NUMERIC GENERATED ALWAYS AS (
    CASE WHEN estimated_duration_hours > 0
    THEN ((actual_duration_hours - estimated_duration_hours) / estimated_duration_hours) * 100
    ELSE NULL END
  ) STORED,

  -- Why the variance (optional)
  variance_reason TEXT,  -- 'weather', 'complexity', 'experience', 'materials'

  -- Metadata
  learned_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for learning queries
CREATE INDEX IF NOT EXISTS idx_learnings_template ON public.task_learnings(task_template_id);
CREATE INDEX IF NOT EXISTS idx_learnings_user ON public.task_learnings(user_id);

-- ============================================
-- 5. PROJECT TYPE DEFINITIONS
-- What tasks typically go with what project types
-- ============================================

CREATE TABLE IF NOT EXISTS public.project_type_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Project type identity
  name TEXT NOT NULL UNIQUE,  -- 'bathroom_remodel', 'kitchen_remodel', etc.
  display_name TEXT NOT NULL, -- 'Bathroom Remodel'
  description TEXT,

  -- Complexity
  complexity TEXT CHECK (complexity IN ('simple', 'medium', 'complex')) DEFAULT 'medium',

  -- Typical duration
  typical_duration_days_min INTEGER,
  typical_duration_days_max INTEGER,
  typical_duration_days_avg INTEGER,

  -- Standard phases for this project type
  default_phases JSONB DEFAULT '[]'::jsonb,
  -- Example: [
  --   {"name": "Demo", "order": 1, "typical_days": 2},
  --   {"name": "Rough-in", "order": 2, "typical_days": 5},
  --   {"name": "Drywall", "order": 3, "typical_days": 4}
  -- ]

  -- Questions to ask for this project type
  qualifying_questions JSONB DEFAULT '[]'::jsonb,
  -- Example: [
  --   {"question": "Is this a gut renovation or cosmetic update?", "options": ["gut", "cosmetic"]},
  --   {"question": "Are you moving any plumbing fixtures?", "options": ["yes", "no"]}
  -- ]

  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Task templates are readable by all authenticated users
-- (They're reference data, not user-specific)
ALTER TABLE public.construction_task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Task templates are viewable by all authenticated users"
  ON public.construction_task_templates FOR SELECT
  TO authenticated
  USING (TRUE);

-- Only service role can modify templates (admin only)
CREATE POLICY "Only service role can modify task templates"
  ON public.construction_task_templates FOR ALL
  TO service_role
  USING (TRUE);

-- Same for dependencies
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dependencies are viewable by all authenticated users"
  ON public.task_dependencies FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Only service role can modify dependencies"
  ON public.task_dependencies FOR ALL
  TO service_role
  USING (TRUE);

-- Same for constraints
ALTER TABLE public.scheduling_constraints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Constraints are viewable by all authenticated users"
  ON public.scheduling_constraints FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Only service role can modify constraints"
  ON public.scheduling_constraints FOR ALL
  TO service_role
  USING (TRUE);

-- Learnings are user-specific
ALTER TABLE public.task_learnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own learnings"
  ON public.task_learnings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own learnings"
  ON public.task_learnings FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Project type templates are readable by all
ALTER TABLE public.project_type_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project types are viewable by all authenticated users"
  ON public.project_type_templates FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Only service role can modify project types"
  ON public.project_type_templates FOR ALL
  TO service_role
  USING (TRUE);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get tasks for a project type with dependencies
CREATE OR REPLACE FUNCTION get_tasks_for_project_type(p_project_type TEXT)
RETURNS TABLE (
  task_id UUID,
  task_name TEXT,
  trade TEXT,
  duration_hours_avg NUMERIC,
  phase_category TEXT,
  depends_on TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id as task_id,
    t.name as task_name,
    t.trade,
    t.duration_hours_avg,
    t.phase_category,
    ARRAY_AGG(dt.name) FILTER (WHERE dt.name IS NOT NULL) as depends_on
  FROM construction_task_templates t
  LEFT JOIN task_dependencies d ON t.id = d.task_id
  LEFT JOIN construction_task_templates dt ON d.depends_on_task_id = dt.id
  WHERE p_project_type = ANY(t.project_types)
     OR t.project_types = '{}'
  GROUP BY t.id, t.name, t.trade, t.duration_hours_avg, t.phase_category
  ORDER BY
    CASE t.phase_category
      WHEN 'planning' THEN 1
      WHEN 'demo' THEN 2
      WHEN 'rough' THEN 3
      WHEN 'inspection' THEN 4
      WHEN 'drywall' THEN 5
      WHEN 'paint' THEN 6
      WHEN 'flooring' THEN 7
      WHEN 'finish' THEN 8
      WHEN 'closeout' THEN 9
      ELSE 10
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate total project duration from tasks
CREATE OR REPLACE FUNCTION calculate_project_duration(p_task_ids UUID[])
RETURNS NUMERIC AS $$
DECLARE
  v_total_hours NUMERIC := 0;
  v_max_drying NUMERIC := 0;
BEGIN
  SELECT
    COALESCE(SUM(duration_hours_avg), 0),
    COALESCE(MAX(drying_time_hours), 0)
  INTO v_total_hours, v_max_drying
  FROM construction_task_templates
  WHERE id = ANY(p_task_ids);

  -- Add drying/lead times (simplified - real calculation would use dependencies)
  RETURN v_total_hours + v_max_drying;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_modified_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER construction_task_templates_updated
  BEFORE UPDATE ON public.construction_task_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_timestamp();

CREATE TRIGGER project_type_templates_updated
  BEFORE UPDATE ON public.project_type_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_timestamp();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE public.construction_task_templates IS 'Knowledge base of construction tasks with realistic duration estimates';
COMMENT ON TABLE public.task_dependencies IS 'Defines what tasks must complete before others can start';
COMMENT ON TABLE public.scheduling_constraints IS 'Business rules for scheduling (work hours, drying times, etc.)';
COMMENT ON TABLE public.task_learnings IS 'Tracks actual vs estimated durations to improve future estimates';
COMMENT ON TABLE public.project_type_templates IS 'Defines standard phases and tasks for common project types';
