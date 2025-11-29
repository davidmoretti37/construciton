-- =====================================================
-- ADD MISSING COLUMNS TO DAILY REPORTS
-- Created: 2025-11-25
-- Purpose: Add custom_tasks and task_progress columns
-- =====================================================

-- Add custom_tasks column for additional work items
ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS custom_tasks JSONB DEFAULT '[]'::jsonb;

-- Add task_progress column for tracking partial task completion
ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS task_progress JSONB DEFAULT '{}'::jsonb;

-- Add comments
COMMENT ON COLUMN daily_reports.custom_tasks IS 'Array of custom task descriptions added by worker';
COMMENT ON COLUMN daily_reports.task_progress IS 'Object mapping task IDs to progress percentages (0-100)';
