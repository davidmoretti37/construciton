-- =====================================================
-- ALLOW OWNERS TO SUBMIT DAILY REPORTS
-- Created: 2025-11-25
-- Purpose: Make worker_id nullable and add reporter columns for owner reports
-- =====================================================

-- Make worker_id nullable (owners don't have worker_id)
ALTER TABLE daily_reports ALTER COLUMN worker_id DROP NOT NULL;

-- Add reporter_type column to distinguish between worker and owner reports
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS reporter_type TEXT DEFAULT 'worker';

-- Add owner_id column for owner reports
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

-- Add constraint: either worker_id or owner_id must be set
ALTER TABLE daily_reports ADD CONSTRAINT daily_reports_reporter_check
  CHECK (worker_id IS NOT NULL OR owner_id IS NOT NULL);

-- Create index on owner_id for faster queries
CREATE INDEX IF NOT EXISTS idx_daily_reports_owner_id ON daily_reports(owner_id);

-- Create RLS policy for owners to insert their own reports
CREATE POLICY "Owners can insert their own daily reports"
ON daily_reports FOR INSERT
TO authenticated
WITH CHECK (
  owner_id = auth.uid()
  OR
  worker_id IN (
    SELECT id FROM workers WHERE user_id = auth.uid()
  )
);

-- Create RLS policy for owners to view reports on their projects
CREATE POLICY "Owners can view reports on their projects"
ON daily_reports FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR
  worker_id IN (
    SELECT id FROM workers WHERE user_id = auth.uid()
  )
  OR
  project_id IN (
    SELECT id FROM projects WHERE user_id = auth.uid()
  )
);
