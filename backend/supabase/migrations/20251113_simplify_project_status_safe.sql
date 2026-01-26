-- Migration: Simplify project status (SAFE VERSION)
-- Fix existing data BEFORE updating constraint

-- Step 1: First, let's see what statuses we currently have
-- (This is just for logging, won't fail)
DO $$
BEGIN
  RAISE NOTICE 'Current status distribution:';
END $$;

-- Step 2: Update all existing projects to valid statuses BEFORE changing constraint
-- Map old statuses to new statuses:
-- 'active' → 'on-track'
-- 'on-track' → 'on-track' (keep)
-- 'behind' → 'on-track' (will be recalculated by app)
-- 'over-budget' → 'on-track' (will be recalculated by app)
-- 'completed' → 'completed' (keep)
-- 'archived' → 'archived' (keep)
-- 'draft' → 'draft' (keep)
-- NULL or anything else → 'on-track'

UPDATE public.projects
SET status = CASE
  WHEN status = 'active' THEN 'on-track'
  WHEN status = 'on-track' THEN 'on-track'
  WHEN status = 'behind' THEN 'on-track'
  WHEN status = 'over-budget' THEN 'on-track'
  WHEN status = 'completed' THEN 'completed'
  WHEN status = 'archived' THEN 'archived'
  WHEN status = 'draft' THEN 'draft'
  ELSE 'on-track'
END
WHERE status IS NULL
   OR status NOT IN ('draft', 'on-track', 'completed', 'archived');

-- Step 3: NOW it's safe to drop and recreate the constraint
ALTER TABLE public.projects
DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE public.projects
ADD CONSTRAINT projects_status_check
CHECK (status IN ('draft', 'on-track', 'behind', 'over-budget', 'completed', 'archived'));

-- Step 4: Set default value
ALTER TABLE public.projects
ALTER COLUMN status SET DEFAULT 'on-track';

-- Step 5: Add helpful comment
COMMENT ON COLUMN public.projects.status IS 'Project status: draft (not started), on-track (active & good), behind (past deadline), over-budget (expenses > contract), completed (finished), archived (closed). Status is auto-calculated by app based on timeline and budget.';

-- Step 6: Verify - show final distribution
SELECT
  status,
  COUNT(*) as count
FROM public.projects
GROUP BY status
ORDER BY
  CASE status
    WHEN 'draft' THEN 1
    WHEN 'on-track' THEN 2
    WHEN 'behind' THEN 3
    WHEN 'over-budget' THEN 4
    WHEN 'completed' THEN 5
    WHEN 'archived' THEN 6
  END;
