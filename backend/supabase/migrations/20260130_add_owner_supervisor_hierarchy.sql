-- =====================================================
-- Owner → Supervisor → Worker Hierarchy Migration
-- =====================================================
-- This migration adds support for a three-tier hierarchy:
-- Owner (business owner) → Supervisor (project manager) → Worker
-- Created: 2026-01-30
-- =====================================================

-- =====================================================
-- 1. ADD OWNER_ID TO PROFILES (Supervisor → Owner link)
-- =====================================================

-- Add owner_id column for supervisors to be linked to an owner
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_owner_id ON public.profiles(owner_id);

-- =====================================================
-- 2. UPDATE ROLE CONSTRAINT
-- =====================================================

-- Drop existing constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add new constraint with supervisor role
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN ('owner', 'supervisor', 'worker'));

-- Note: Existing 'owner' users remain as 'owner' (top-level)
-- They can add supervisors or continue working as solo operators

-- =====================================================
-- 3. CREATE SUPERVISOR_INVITES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.supervisor_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(owner_id, email)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_supervisor_invites_email ON public.supervisor_invites(email);
CREATE INDEX IF NOT EXISTS idx_supervisor_invites_owner_id ON public.supervisor_invites(owner_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_invites_status ON public.supervisor_invites(status);

-- Enable RLS
ALTER TABLE public.supervisor_invites ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. RLS POLICIES FOR SUPERVISOR_INVITES
-- =====================================================

-- Owners can manage their supervisor invites
CREATE POLICY "Owners can manage their supervisor invites"
ON public.supervisor_invites FOR ALL
USING (owner_id = auth.uid());

-- Supervisors can view pending invites by email (to accept them)
-- Uses the get_current_user_email function if it exists, otherwise falls back
CREATE POLICY "Users can view pending invites by email"
ON public.supervisor_invites FOR SELECT
USING (
  status = 'pending'
  AND email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- =====================================================
-- 5. ACCEPT_SUPERVISOR_INVITE FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION accept_supervisor_invite(
  p_invite_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite RECORD;
  v_user_email TEXT;
BEGIN
  -- Get user email
  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;

  -- Get the pending invitation
  SELECT * INTO v_invite
  FROM supervisor_invites
  WHERE id = p_invite_id
    AND status = 'pending';

  IF v_invite IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitation not found or already processed');
  END IF;

  -- Verify email matches (case insensitive)
  IF LOWER(v_invite.email) != LOWER(v_user_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email does not match invitation');
  END IF;

  -- Update the user's profile to be a supervisor linked to this owner
  UPDATE profiles
  SET role = 'supervisor',
      owner_id = v_invite.owner_id
  WHERE id = p_user_id;

  -- Mark invitation as accepted
  UPDATE supervisor_invites
  SET status = 'accepted',
      accepted_at = NOW()
  WHERE id = p_invite_id;

  RETURN jsonb_build_object(
    'success', true,
    'owner_id', v_invite.owner_id,
    'message', 'Successfully joined as supervisor'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- =====================================================
-- 6. REJECT_SUPERVISOR_INVITE FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION reject_supervisor_invite(
  p_invite_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite RECORD;
  v_user_email TEXT;
BEGIN
  -- Get user email
  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;

  -- Get the pending invitation
  SELECT * INTO v_invite
  FROM supervisor_invites
  WHERE id = p_invite_id
    AND status = 'pending';

  IF v_invite IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitation not found or already processed');
  END IF;

  -- Verify email matches
  IF LOWER(v_invite.email) != LOWER(v_user_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email does not match invitation');
  END IF;

  -- Mark invitation as rejected
  UPDATE supervisor_invites
  SET status = 'rejected'
  WHERE id = p_invite_id;

  RETURN jsonb_build_object('success', true, 'message', 'Invitation rejected');
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- =====================================================
-- 7. RLS POLICIES FOR OWNER ACCESS TO SUPERVISOR DATA
-- =====================================================

-- Owners can view their supervisors' profiles
CREATE POLICY "Owners can view their supervisors"
ON public.profiles FOR SELECT
USING (owner_id = auth.uid());

-- Owners can view their supervisors' projects
CREATE POLICY "Owners can view supervisor projects"
ON public.projects FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = projects.user_id
    AND profiles.owner_id = auth.uid()
  )
);

-- Owners can view their supervisors' workers
CREATE POLICY "Owners can view supervisor workers"
ON public.workers FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = workers.owner_id
    AND profiles.owner_id = auth.uid()
  )
);

-- Owners can view time tracking for their supervisors' workers
CREATE POLICY "Owners can view supervisor time tracking"
ON public.time_tracking FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM workers w
    JOIN profiles p ON p.id = w.owner_id
    WHERE w.id = time_tracking.worker_id
    AND p.owner_id = auth.uid()
  )
);

-- Owners can view daily reports for their supervisors' projects
CREATE POLICY "Owners can view supervisor daily reports"
ON public.daily_reports FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM projects proj
    JOIN profiles p ON p.id = proj.user_id
    WHERE proj.id = daily_reports.project_id
    AND p.owner_id = auth.uid()
  )
);

-- Owners can view transactions for their supervisors' projects
CREATE POLICY "Owners can view supervisor transactions"
ON public.project_transactions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM projects proj
    JOIN profiles p ON p.id = proj.user_id
    WHERE proj.id = project_transactions.project_id
    AND p.owner_id = auth.uid()
  )
);

-- Owners can view estimates for their supervisors
CREATE POLICY "Owners can view supervisor estimates"
ON public.estimates FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = estimates.user_id
    AND profiles.owner_id = auth.uid()
  )
);

-- Owners can view invoices for their supervisors
CREATE POLICY "Owners can view supervisor invoices"
ON public.invoices FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = invoices.user_id
    AND profiles.owner_id = auth.uid()
  )
);

-- =====================================================
-- 8. HELPER FUNCTION: GET SUPERVISORS FOR OWNER
-- =====================================================

CREATE OR REPLACE FUNCTION get_owner_supervisors(p_owner_id UUID)
RETURNS TABLE (
  id UUID,
  email TEXT,
  business_name TEXT,
  business_phone TEXT,
  is_onboarded BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE,
  project_count BIGINT,
  worker_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    u.email,
    p.business_name,
    p.business_phone,
    p.is_onboarded,
    p.created_at,
    (SELECT COUNT(*) FROM projects WHERE projects.user_id = p.id) as project_count,
    (SELECT COUNT(*) FROM workers WHERE workers.owner_id = p.id) as worker_count
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.owner_id = p_owner_id
    AND p.role = 'supervisor';
END;
$$;

-- =====================================================
-- 9. HELPER FUNCTION: GET OWNER DASHBOARD STATS
-- =====================================================

CREATE OR REPLACE FUNCTION get_owner_dashboard_stats(p_owner_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stats JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_supervisors', (
      SELECT COUNT(*) FROM profiles
      WHERE owner_id = p_owner_id AND role = 'supervisor'
    ),
    'total_projects', (
      SELECT COUNT(*) FROM projects proj
      JOIN profiles p ON p.id = proj.user_id
      WHERE p.owner_id = p_owner_id OR proj.user_id = p_owner_id
    ),
    'active_projects', (
      SELECT COUNT(*) FROM projects proj
      JOIN profiles p ON p.id = proj.user_id
      WHERE (p.owner_id = p_owner_id OR proj.user_id = p_owner_id)
        AND proj.status IN ('active', 'in_progress')
    ),
    'total_workers', (
      SELECT COUNT(*) FROM workers w
      JOIN profiles p ON p.id = w.owner_id
      WHERE p.owner_id = p_owner_id OR w.owner_id = p_owner_id
    ),
    'total_revenue', (
      SELECT COALESCE(SUM(proj.contract_amount), 0) FROM projects proj
      JOIN profiles p ON p.id = proj.user_id
      WHERE p.owner_id = p_owner_id OR proj.user_id = p_owner_id
    ),
    'pending_invites', (
      SELECT COUNT(*) FROM supervisor_invites
      WHERE owner_id = p_owner_id AND status = 'pending'
    )
  ) INTO v_stats;

  RETURN v_stats;
END;
$$;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- To run: Execute this SQL in Supabase SQL editor
-- Test RLS policies before deploying to production
-- =====================================================
