-- Add phase-level worker assignments and scheduling support

-- Phase Assignments Table
-- Links workers to specific phases within projects
CREATE TABLE IF NOT EXISTS phase_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES project_phases(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Prevent duplicate assignments
  UNIQUE(phase_id, worker_id)
);

-- Worker Schedules Table
-- Manages when workers are scheduled to work on projects/phases
CREATE TABLE IF NOT EXISTS worker_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES project_phases(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE,
  start_time TIME,
  end_time TIME,
  recurring BOOLEAN DEFAULT false,
  recurring_days INTEGER[], -- 0=Sunday, 1=Monday, etc.
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Must have either project_id or phase_id
  CONSTRAINT has_project_or_phase CHECK (project_id IS NOT NULL OR phase_id IS NOT NULL)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_phase_assignments_phase ON phase_assignments(phase_id);
CREATE INDEX IF NOT EXISTS idx_phase_assignments_worker ON phase_assignments(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_schedules_worker ON worker_schedules(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_schedules_project ON worker_schedules(project_id);
CREATE INDEX IF NOT EXISTS idx_worker_schedules_phase ON worker_schedules(phase_id);
CREATE INDEX IF NOT EXISTS idx_worker_schedules_dates ON worker_schedules(start_date, end_date);

-- Add comments
COMMENT ON TABLE phase_assignments IS 'Links workers to specific project phases';
COMMENT ON TABLE worker_schedules IS 'Manages worker work schedules for projects and phases';

-- RLS Policies for phase_assignments
ALTER TABLE phase_assignments ENABLE ROW LEVEL SECURITY;

-- Owners can manage phase assignments for their projects
CREATE POLICY "Owners can manage phase assignments"
  ON phase_assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM project_phases pp
      JOIN projects p ON pp.project_id = p.id
      WHERE pp.id = phase_assignments.phase_id
      AND p.user_id = auth.uid()
    )
  );

-- Workers can view their phase assignments
CREATE POLICY "Workers can view their phase assignments"
  ON phase_assignments
  FOR SELECT
  USING (worker_id IN (
    SELECT id FROM workers WHERE user_id = auth.uid()
  ));

-- RLS Policies for worker_schedules
ALTER TABLE worker_schedules ENABLE ROW LEVEL SECURITY;

-- Owners can manage schedules for their workers
CREATE POLICY "Owners can manage worker schedules"
  ON worker_schedules
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workers w
      WHERE w.id = worker_schedules.worker_id
      AND w.owner_id = auth.uid()
    )
  );

-- Workers can view their own schedules
CREATE POLICY "Workers can view their schedules"
  ON worker_schedules
  FOR SELECT
  USING (worker_id IN (
    SELECT id FROM workers WHERE user_id = auth.uid()
  ));

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_worker_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_phase_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER update_worker_schedules_timestamp
  BEFORE UPDATE ON worker_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_worker_schedules_updated_at();

CREATE TRIGGER update_phase_assignments_timestamp
  BEFORE UPDATE ON phase_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_phase_assignments_updated_at();
