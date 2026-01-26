-- Fix project status constraint issue
-- First update all invalid statuses, then apply constraint

-- Step 1: Show current status values
DO $$
BEGIN
    RAISE NOTICE 'Current status values:';
END $$;

SELECT status, COUNT(*) as count
FROM public.projects
GROUP BY status
ORDER BY status;

-- Step 2: Update all invalid statuses to 'active'
UPDATE public.projects
SET status = 'active'
WHERE status NOT IN ('draft', 'active', 'completed', 'archived')
   OR status IS NULL;

-- Step 3: Drop old constraint if exists
ALTER TABLE public.projects
DROP CONSTRAINT IF EXISTS projects_status_check;

-- Step 4: Add new constraint
ALTER TABLE public.projects
ADD CONSTRAINT projects_status_check
CHECK (status IN ('draft', 'active', 'completed', 'archived'));

-- Step 5: Add default value for status
ALTER TABLE public.projects
ALTER COLUMN status SET DEFAULT 'active';

-- Step 6: Verify migration
SELECT status, COUNT(*) as count
FROM public.projects
GROUP BY status
ORDER BY status;

-- Add comment explaining the status field
COMMENT ON COLUMN public.projects.status IS 'Project lifecycle status: draft (not started), active (in progress), completed (finished), archived (closed). Dynamic statuses like on-track/behind are calculated in app based on timeline and progress.';
