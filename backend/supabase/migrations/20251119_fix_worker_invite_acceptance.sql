-- =====================================================
-- Fix Worker Invite Acceptance
-- =====================================================
-- Allow workers to update their own pending invitation
-- to claim it by setting user_id
-- Created: 2025-11-19

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Workers can claim pending invites" ON public.workers;

-- Create policy to allow workers to update pending invites that match their email
-- This allows them to "claim" the invitation by setting user_id
CREATE POLICY "Workers can claim pending invites"
ON public.workers FOR UPDATE
USING (
  email = public.get_current_user_email()
  AND status = 'pending'
  AND user_id IS NULL
)
WITH CHECK (
  email = public.get_current_user_email()
  AND status = 'active'
  AND user_id = auth.uid()
);

-- Add comment for documentation
COMMENT ON POLICY "Workers can claim pending invites" ON public.workers IS
'Allows workers to claim (update) pending invitations that match their email by setting user_id and status to active';
