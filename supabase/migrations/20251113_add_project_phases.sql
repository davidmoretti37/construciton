-- =====================================================
-- PROJECT PHASES SYSTEM
-- Created: 2025-11-13
-- Purpose: Add phased timeline tracking to projects
-- =====================================================

-- Create project_phases table
CREATE TABLE IF NOT EXISTS project_phases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL,

  -- Timeline fields
  planned_days INTEGER NOT NULL,
  start_date DATE,
  end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,

  -- Progress tracking
  completion_percentage INTEGER DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'behind')),

  -- Time extensions tracking
  time_extensions JSONB DEFAULT '[]'::jsonb,

  -- Optional task checklist for auto-completion
  tasks JSONB DEFAULT '[]'::jsonb,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for faster project phase lookups
CREATE INDEX idx_project_phases_project_id ON project_phases(project_id);
CREATE INDEX idx_project_phases_order ON project_phases(project_id, order_index);

-- Add RLS policies
ALTER TABLE project_phases ENABLE ROW LEVEL SECURITY;

-- Users can view their own project phases
CREATE POLICY "Users can view own project phases"
  ON project_phases FOR SELECT
  USING (project_id IN (
    SELECT id FROM projects WHERE user_id = auth.uid()
  ));

-- Users can insert phases for their own projects
CREATE POLICY "Users can insert own project phases"
  ON project_phases FOR INSERT
  WITH CHECK (project_id IN (
    SELECT id FROM projects WHERE user_id = auth.uid()
  ));

-- Users can update their own project phases
CREATE POLICY "Users can update own project phases"
  ON project_phases FOR UPDATE
  USING (project_id IN (
    SELECT id FROM projects WHERE user_id = auth.uid()
  ));

-- Users can delete their own project phases
CREATE POLICY "Users can delete own project phases"
  ON project_phases FOR DELETE
  USING (project_id IN (
    SELECT id FROM projects WHERE user_id = auth.uid()
  ));

-- Update trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_project_phases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER project_phases_updated_at
  BEFORE UPDATE ON project_phases
  FOR EACH ROW
  EXECUTE FUNCTION update_project_phases_updated_at();

-- Add has_phases column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS has_phases BOOLEAN DEFAULT FALSE;

-- Function to auto-update phase status based on dates
CREATE OR REPLACE FUNCTION calculate_phase_status(phase_row project_phases)
RETURNS TEXT AS $$
DECLARE
  current_date DATE := CURRENT_DATE;
  phase_status TEXT;
BEGIN
  -- If completed, status is completed
  IF phase_row.status = 'completed' OR phase_row.completion_percentage = 100 THEN
    RETURN 'completed';
  END IF;

  -- If not started yet
  IF phase_row.status = 'not_started' AND phase_row.actual_start_date IS NULL THEN
    RETURN 'not_started';
  END IF;

  -- If in progress, check if behind schedule
  IF phase_row.status = 'in_progress' OR phase_row.actual_start_date IS NOT NULL THEN
    -- Behind if past end date and not completed
    IF phase_row.end_date IS NOT NULL AND current_date > phase_row.end_date THEN
      RETURN 'behind';
    END IF;
    RETURN 'in_progress';
  END IF;

  RETURN phase_row.status;
END;
$$ LANGUAGE plpgsql;

-- Add helpful comments
COMMENT ON TABLE project_phases IS 'Tracks project phases/stages with timeline and progress';
COMMENT ON COLUMN project_phases.time_extensions IS 'Array of time extensions: [{days: 2, reason: "weather delay", dateAdded: "2025-11-13"}]';
COMMENT ON COLUMN project_phases.tasks IS 'Optional task checklist: [{name: "Pour foundation", completed: false}]';
