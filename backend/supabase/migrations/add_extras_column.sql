-- Add extras column to projects table for tracking additional work/change orders
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS extras JSONB DEFAULT '[]'::jsonb;

-- Update existing projects to have empty extras array if NULL
UPDATE public.projects
SET extras = '[]'::jsonb
WHERE extras IS NULL;
