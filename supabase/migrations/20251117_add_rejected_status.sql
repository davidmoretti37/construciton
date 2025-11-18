-- Add 'rejected' status to workers table
-- Allows tracking when workers decline owner invites

-- Drop the existing check constraint
ALTER TABLE public.workers
DROP CONSTRAINT IF EXISTS workers_status_check;

-- Add new check constraint with 'rejected' status
ALTER TABLE public.workers
ADD CONSTRAINT workers_status_check
CHECK (status IN ('pending', 'active', 'inactive', 'rejected'));

-- Add comment
COMMENT ON COLUMN public.workers.status IS 'Worker status: pending (invited), active (accepted), inactive (disabled), rejected (declined invite)';
