-- =====================================================
-- TASK PARTIAL COMPLETION SUPPORT
-- Created: 2025-11-21
-- Purpose: Add progress percentage (0-100) to individual tasks within phases
-- =====================================================

-- Note: Tasks are stored as JSONB arrays in project_phases.tasks
-- This migration adds documentation and a validation trigger

-- Add comment explaining the new task structure
COMMENT ON COLUMN public.project_phases.tasks IS
'JSONB array of tasks. Each task should have:
{
  "id": "uuid",
  "description": "Task description",
  "completed": boolean (true if 100% done),
  "progress": integer (0-100, percentage complete),
  "completed_by": "worker_id" (optional),
  "completed_at": "timestamp" (optional),
  "photo_url": "url" (optional)
}
Example: [{"id": "123", "description": "Frame kitchen", "completed": false, "progress": 65}]';

-- Create a function to validate task progress values
CREATE OR REPLACE FUNCTION validate_task_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate that all tasks have progress between 0-100
  IF NEW.tasks IS NOT NULL THEN
    -- Check if any task has invalid progress
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(NEW.tasks) AS task
      WHERE (task->>'progress')::int < 0 OR (task->>'progress')::int > 100
    ) THEN
      RAISE EXCEPTION 'Task progress must be between 0 and 100';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate task progress on insert/update
DROP TRIGGER IF EXISTS validate_task_progress_trigger ON public.project_phases;
CREATE TRIGGER validate_task_progress_trigger
  BEFORE INSERT OR UPDATE ON public.project_phases
  FOR EACH ROW
  EXECUTE FUNCTION validate_task_progress();

-- =====================================================
-- MIGRATION NOTES
-- =====================================================
-- Existing tasks without 'progress' field will default to:
-- - progress: 100 if completed: true
-- - progress: 0 if completed: false
-- This is handled in the application layer (storage.js / phaseService.js)
