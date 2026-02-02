-- Cleanup orphaned worker_tasks and time_tracking records
-- These are records where project_id points to non-existent projects

-- First, log what we're about to delete (for debugging)
DO $$
DECLARE
  orphan_tasks_count INTEGER;
  orphan_tracking_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_tasks_count
  FROM worker_tasks
  WHERE project_id NOT IN (SELECT id FROM projects);

  SELECT COUNT(*) INTO orphan_tracking_count
  FROM time_tracking
  WHERE project_id NOT IN (SELECT id FROM projects);

  RAISE NOTICE 'Deleting % orphaned worker_tasks', orphan_tasks_count;
  RAISE NOTICE 'Deleting % orphaned time_tracking records', orphan_tracking_count;
END $$;

-- Delete orphaned worker_tasks
DELETE FROM worker_tasks
WHERE project_id NOT IN (SELECT id FROM projects);

-- Delete orphaned time_tracking records
DELETE FROM time_tracking
WHERE project_id NOT IN (SELECT id FROM projects);

-- Also clean up orphaned project_phases (if any)
DELETE FROM project_phases
WHERE project_id NOT IN (SELECT id FROM projects);
