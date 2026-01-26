-- =====================================================
-- PROGRESS TRACKING & VELOCITY SYSTEM
-- Created: 2025-11-21
-- Purpose: Add dual progress tracking, velocity calculation, and predictive completion dates
-- =====================================================

-- Add new columns to projects table
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS actual_progress INTEGER DEFAULT 0 CHECK (actual_progress >= 0 AND actual_progress <= 100),
  ADD COLUMN IF NOT EXISTS progress_override BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS actual_start_date DATE,
  ADD COLUMN IF NOT EXISTS estimated_completion_date DATE,
  ADD COLUMN IF NOT EXISTS velocity_tasks_per_day DECIMAL(5,2) DEFAULT 0;

-- Add 'scheduled' status to existing status check constraint
-- First, drop the existing constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'projects_status_check'
    AND conrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.projects DROP CONSTRAINT projects_status_check;
  END IF;
END $$;

-- Add new constraint with 'scheduled' status
ALTER TABLE public.projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN ('scheduled', 'active', 'on-track', 'behind', 'over-budget', 'completed', 'archived'));

-- Create index for scheduled projects lookup (for auto-start function)
CREATE INDEX IF NOT EXISTS idx_projects_scheduled_start
  ON public.projects(status, start_date)
  WHERE status = 'scheduled';

-- Create index for velocity calculations
CREATE INDEX IF NOT EXISTS idx_projects_velocity
  ON public.projects(velocity_tasks_per_day, estimated_completion_date);

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================
COMMENT ON COLUMN public.projects.actual_progress IS 'Task-based completion percentage (0-100), calculated from phase completion or manually overridden';
COMMENT ON COLUMN public.projects.progress_override IS 'True if actual_progress was manually set by owner, false if auto-calculated';
COMMENT ON COLUMN public.projects.actual_start_date IS 'Actual date project started (when status changed from scheduled to active)';
COMMENT ON COLUMN public.projects.estimated_completion_date IS 'Predicted completion date based on current velocity';
COMMENT ON COLUMN public.projects.velocity_tasks_per_day IS 'Average tasks completed per day (completedTasks / daysElapsed)';
