-- Complete fix for status constraint issues
-- This will handle all edge cases

-- Step 1: First, let's see what we're working with
SELECT 'Current projects with their status:' as info;
SELECT id, name, status FROM public.projects ORDER BY created_at DESC LIMIT 10;

-- Step 2: Update any NULL or invalid status values
UPDATE public.projects
SET status = 'active'
WHERE status IS NULL
   OR status NOT IN ('draft', 'active', 'completed', 'archived');

-- Step 3: Drop ALL constraints on the projects table that mention status
DO $$
DECLARE
    constraint_name text;
BEGIN
    FOR constraint_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.projects'::regclass
        AND conname LIKE '%status%'
    LOOP
        EXECUTE format('ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS %I CASCADE', constraint_name);
        RAISE NOTICE 'Dropped constraint: %', constraint_name;
    END LOOP;
END $$;

-- Step 4: Add the correct status constraint
ALTER TABLE public.projects
ADD CONSTRAINT projects_status_check
CHECK (status IN ('draft', 'active', 'completed', 'archived'));

-- Step 5: Set default
ALTER TABLE public.projects
ALTER COLUMN status SET DEFAULT 'active';

-- Step 6: Make sure status is NOT NULL
ALTER TABLE public.projects
ALTER COLUMN status SET NOT NULL;

-- Step 7: Verify the fix
SELECT 'Final status distribution:' as info;
SELECT status, COUNT(*) as count
FROM public.projects
GROUP BY status
ORDER BY status;

SELECT 'Constraint verification:' as info;
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.projects'::regclass
AND conname LIKE '%status%';
