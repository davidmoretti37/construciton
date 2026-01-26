-- =====================================================
-- Fix Worker Invitation Visibility
-- =====================================================
-- This migration adds RLS policy to allow workers to see
-- pending invitations that match their email address
-- Created: 2025-11-19

-- First, we need to create a function to get the current user's email
-- because we cannot directly query auth.users in RLS policies
CREATE OR REPLACE FUNCTION public.get_current_user_email()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT email FROM auth.users WHERE id = auth.uid();
$$;

-- Drop the policy if it already exists (idempotent migration)
DROP POLICY IF EXISTS "Workers can view pending invites by email" ON public.workers;

-- Add policy for workers to view pending invites by email
-- This allows a worker who signs up with an email to see
-- if there are any pending invitations for that email
CREATE POLICY "Workers can view pending invites by email"
ON public.workers FOR SELECT
USING (
  email = public.get_current_user_email()
  AND status = 'pending'
  AND user_id IS NULL
);

-- Add comment for documentation
COMMENT ON POLICY "Workers can view pending invites by email" ON public.workers IS
'Allows workers to see pending invitations that match their authenticated email address, even if user_id is not yet set';
