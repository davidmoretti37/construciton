-- =====================================================
-- DAILY REPORTS SYSTEM
-- Created: 2025-11-14
-- Purpose: Worker daily progress reports with photos and task completion
-- =====================================================

-- Create daily_reports table
CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES project_phases(id) ON DELETE SET NULL,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Content
  photos JSONB DEFAULT '[]'::jsonb, -- Array of photo URLs: ["url1", "url2"]
  completed_steps JSONB DEFAULT '[]'::jsonb, -- Array of step IDs completed: ["uuid1", "uuid2"]
  notes TEXT,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for faster lookups
CREATE INDEX idx_daily_reports_worker ON daily_reports(worker_id);
CREATE INDEX idx_daily_reports_project ON daily_reports(project_id);
CREATE INDEX idx_daily_reports_phase ON daily_reports(phase_id);
CREATE INDEX idx_daily_reports_date ON daily_reports(report_date);
CREATE INDEX idx_daily_reports_worker_date ON daily_reports(worker_id, report_date);

-- Add RLS policies
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;

-- Workers can view their own reports
CREATE POLICY "Workers can view own reports"
  ON daily_reports FOR SELECT
  USING (worker_id IN (
    SELECT id FROM workers WHERE user_id = auth.uid()
  ));

-- Project owners can view reports for their projects
CREATE POLICY "Owners can view project reports"
  ON daily_reports FOR SELECT
  USING (project_id IN (
    SELECT id FROM projects WHERE user_id = auth.uid()
  ));

-- Workers can insert their own reports
CREATE POLICY "Workers can insert own reports"
  ON daily_reports FOR INSERT
  WITH CHECK (worker_id IN (
    SELECT id FROM workers WHERE user_id = auth.uid()
  ));

-- Workers can update their own reports
CREATE POLICY "Workers can update own reports"
  ON daily_reports FOR UPDATE
  USING (worker_id IN (
    SELECT id FROM workers WHERE user_id = auth.uid()
  ));

-- Workers can delete their own reports
CREATE POLICY "Workers can delete own reports"
  ON daily_reports FOR DELETE
  USING (worker_id IN (
    SELECT id FROM workers WHERE user_id = auth.uid()
  ));

-- Update trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_daily_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER daily_reports_updated_at
  BEFORE UPDATE ON daily_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_daily_reports_updated_at();

-- Add helpful comments
COMMENT ON TABLE daily_reports IS 'Worker daily progress reports with photos and completed tasks';
COMMENT ON COLUMN daily_reports.photos IS 'Array of photo URLs from day''s work';
COMMENT ON COLUMN daily_reports.completed_steps IS 'Array of task/step IDs checked off as completed';
