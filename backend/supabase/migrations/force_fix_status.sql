-- Force fix status constraint by temporarily disabling checks

-- Step 1: Drop the constraint entirely (without checking existing data)
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;

-- Step 2: Update ALL rows to have valid status
UPDATE public.projects
SET status = CASE
    WHEN status IN ('draft', 'completed', 'archived') THEN status
    ELSE 'active'
END;

-- Step 3: Update any NULL statuses
UPDATE public.projects
SET status = 'active'
WHERE status IS NULL;

-- Step 4: Now add the constraint (this will work since all data is clean)
ALTER TABLE public.projects
ADD CONSTRAINT projects_status_check
CHECK (status IN ('draft', 'active', 'completed', 'archived'));

-- Step 5: Set default and NOT NULL
ALTER TABLE public.projects
ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE public.projects
ALTER COLUMN status SET NOT NULL;

-- Verify
SELECT 'Status values after fix:' as info;
SELECT status, COUNT(*) FROM public.projects GROUP BY status;
