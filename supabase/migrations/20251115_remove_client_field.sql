-- Remove client field from projects table
-- Project name is the only identifier needed

ALTER TABLE public.projects
DROP COLUMN IF EXISTS client;

-- Update any existing views or functions that reference client
-- (Add here if needed)
