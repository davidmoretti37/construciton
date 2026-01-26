-- Add foreign key constraint between workers and profiles (owner)
-- This allows Supabase to properly join workers with their owner's profile info

ALTER TABLE public.workers
ADD CONSTRAINT workers_owner_id_fkey
FOREIGN KEY (owner_id)
REFERENCES public.profiles(id)
ON DELETE CASCADE;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_workers_owner_id ON public.workers(owner_id);

-- Add comment
COMMENT ON CONSTRAINT workers_owner_id_fkey ON public.workers IS 'Links worker to their owner (employer) profile';
