-- =====================================================
-- UPDATE PHASE TASKS STRUCTURE
-- Created: 2025-11-14
-- Purpose: Enhance tasks field to track detailed step information
-- =====================================================

-- Add comment to clarify new task structure
COMMENT ON COLUMN project_phases.tasks IS 'Task checklist with detailed tracking: [{id: uuid, description: "Pour concrete", order: 1, completed: false, completed_by: worker_id, completed_date: timestamp, photo_url: string}]';

-- Function to calculate phase completion percentage from tasks
CREATE OR REPLACE FUNCTION calculate_phase_progress_from_tasks(phase_id UUID)
RETURNS INTEGER AS $$
DECLARE
  total_tasks INTEGER;
  completed_tasks INTEGER;
  completion_pct INTEGER;
BEGIN
  -- Get the phase tasks
  SELECT
    jsonb_array_length(tasks) INTO total_tasks
  FROM project_phases
  WHERE id = phase_id;

  -- If no tasks, return current completion_percentage
  IF total_tasks IS NULL OR total_tasks = 0 THEN
    SELECT completion_percentage INTO completion_pct
    FROM project_phases
    WHERE id = phase_id;
    RETURN COALESCE(completion_pct, 0);
  END IF;

  -- Count completed tasks
  SELECT
    COUNT(*) INTO completed_tasks
  FROM project_phases,
    jsonb_array_elements(tasks) AS task
  WHERE id = phase_id
    AND (task->>'completed')::boolean = true;

  -- Calculate percentage
  completion_pct := ROUND((completed_tasks::DECIMAL / total_tasks::DECIMAL) * 100);

  RETURN completion_pct;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update phase completion when tasks change
CREATE OR REPLACE FUNCTION auto_update_phase_completion()
RETURNS TRIGGER AS $$
DECLARE
  new_completion INTEGER;
BEGIN
  -- Calculate new completion percentage from tasks
  new_completion := calculate_phase_progress_from_tasks(NEW.id);

  -- Update the completion_percentage if it changed
  IF new_completion != NEW.completion_percentage THEN
    NEW.completion_percentage := new_completion;
  END IF;

  -- Auto-mark as completed if 100%
  IF new_completion = 100 AND NEW.status != 'completed' THEN
    NEW.status := 'completed';
    NEW.actual_end_date := CURRENT_DATE;
  END IF;

  -- Auto-mark as in_progress if tasks are being completed
  IF new_completion > 0 AND NEW.status = 'not_started' THEN
    NEW.status := 'in_progress';
    NEW.actual_start_date := COALESCE(NEW.actual_start_date, CURRENT_DATE);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER phase_tasks_auto_completion
  BEFORE UPDATE ON project_phases
  FOR EACH ROW
  WHEN (OLD.tasks IS DISTINCT FROM NEW.tasks)
  EXECUTE FUNCTION auto_update_phase_completion();

-- Add helpful comment
COMMENT ON FUNCTION calculate_phase_progress_from_tasks IS 'Calculates phase completion percentage based on completed tasks';
COMMENT ON FUNCTION auto_update_phase_completion IS 'Automatically updates phase completion and status when tasks change';
