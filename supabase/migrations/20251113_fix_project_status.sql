-- Migration: Fix project status - Remove dynamic statuses from database
-- Status should only be: draft, active, completed, archived
-- "on-track", "behind", "over-budget" should be calculated in the app

-- Step 1: Update constraint to remove dynamic statuses
ALTER TABLE public.projects
DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE public.projects
ADD CONSTRAINT projects_status_check
CHECK (status IN ('draft', 'active', 'completed', 'archived'));

-- Step 2: Migrate existing projects with dynamic statuses to 'active'
UPDATE public.projects
SET status = 'active'
WHERE status IN ('on-track', 'behind', 'over-budget');

-- Step 3: Add comment explaining the status field
COMMENT ON COLUMN public.projects.status IS 'Project lifecycle status: draft (not started), active (in progress), completed (finished), archived (closed). Dynamic statuses like on-track/behind are calculated in app based on timeline and progress.';

-- Step 4: Verify migration
-- SELECT status, COUNT(*) as count
-- FROM public.projects
-- GROUP BY status
-- ORDER BY status;
