-- Remove 'draft' status and convert all draft projects to 'active'
-- New valid statuses: active, completed, archived

-- Update all draft projects to active
UPDATE public.projects
SET status = 'active'
WHERE status = 'draft';

-- Drop the old constraint
ALTER TABLE public.projects
DROP CONSTRAINT IF EXISTS projects_status_check;

-- Add new constraint without 'draft'
ALTER TABLE public.projects
ADD CONSTRAINT projects_status_check
CHECK (status IN ('active', 'completed', 'archived'));

-- Update the default value
ALTER TABLE public.projects
ALTER COLUMN status SET DEFAULT 'active';

-- Update column comment
COMMENT ON COLUMN public.projects.status IS 'Project lifecycle status: active (in progress), completed (finished), archived (closed). All new projects start as active.';
