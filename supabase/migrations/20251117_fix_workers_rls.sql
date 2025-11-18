-- Fix RLS policies for workers table to allow owners to create workers
-- The original policy only allowed workers to self-register with user_id = auth.uid()
-- This adds a policy for owners to create workers without a user_id

-- Step 1: Drop the foreign key constraint temporarily
ALTER TABLE public.workers
DROP CONSTRAINT IF EXISTS workers_user_id_fkey;

-- Step 2: Drop the UNIQUE constraint on user_id
ALTER TABLE public.workers
DROP CONSTRAINT IF EXISTS workers_user_id_key;

-- Step 3: Drop the NOT NULL constraint on user_id
ALTER TABLE public.workers
ALTER COLUMN user_id DROP NOT NULL;

-- Step 4: Recreate the foreign key constraint (now nullable)
ALTER TABLE public.workers
ADD CONSTRAINT workers_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES auth.users(id)
ON DELETE CASCADE;

-- Step 5: Create a partial unique index that only enforces uniqueness for non-NULL user_ids
CREATE UNIQUE INDEX IF NOT EXISTS workers_user_id_unique_idx
ON public.workers(user_id)
WHERE user_id IS NOT NULL;

-- Step 6: Fix RLS policies
-- Drop existing insert policies
DROP POLICY IF EXISTS "Anyone can insert worker record" ON public.workers;
DROP POLICY IF EXISTS "Workers can self-register" ON public.workers;
DROP POLICY IF EXISTS "Owners can create workers" ON public.workers;

-- Allow workers to self-register (with user_id)
CREATE POLICY "Workers can self-register"
ON public.workers FOR INSERT
WITH CHECK (user_id = auth.uid() AND user_id IS NOT NULL);

-- Allow owners to create worker records (without user_id initially)
CREATE POLICY "Owners can create workers"
ON public.workers FOR INSERT
WITH CHECK (owner_id = auth.uid());
