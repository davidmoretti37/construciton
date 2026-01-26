-- Migration: Simplify project status to only meaningful values
-- Remove 'active' - use calculated statuses instead

-- Status values:
-- - draft: Not started yet
-- - on-track: Active project going well (within budget, on schedule)
-- - behind: Active project past deadline
-- - over-budget: Active project over budget
-- - completed: Project finished
-- - archived: Project closed/archived

-- Step 1: Update constraint to new status values
ALTER TABLE public.projects
DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE public.projects
ADD CONSTRAINT projects_status_check
CHECK (status IN ('draft', 'on-track', 'behind', 'over-budget', 'completed', 'archived'));

-- Step 2: Migrate existing 'active' projects to 'on-track' (will be recalculated by app)
UPDATE public.projects
SET status = 'on-track'
WHERE status = 'active';

-- Step 3: Add comment explaining the status field
COMMENT ON COLUMN public.projects.status IS 'Project status: draft (not started), on-track (active & good), behind (past deadline), over-budget (expenses > contract), completed (finished), archived (closed)';

-- Step 4: Verify migration - show distribution of statuses
SELECT status, COUNT(*) as count
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
