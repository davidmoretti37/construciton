-- =====================================================
-- Supervisor Payment & Time Tracking Migration
-- =====================================================
-- Adds payment type selection for supervisors and
-- time tracking capabilities (clock-in/out)
-- Created: 2026-02-01
-- =====================================================

-- =====================================================
-- 1. ADD PAYMENT COLUMNS TO SUPERVISOR_INVITES
-- =====================================================

ALTER TABLE public.supervisor_invites
ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'hourly'
  CHECK (payment_type IN ('hourly', 'daily', 'weekly', 'project_based'));

ALTER TABLE public.supervisor_invites
ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10, 2) DEFAULT 0;

ALTER TABLE public.supervisor_invites
ADD COLUMN IF NOT EXISTS daily_rate NUMERIC(10, 2) DEFAULT 0;

ALTER TABLE public.supervisor_invites
ADD COLUMN IF NOT EXISTS weekly_salary NUMERIC(10, 2) DEFAULT 0;

ALTER TABLE public.supervisor_invites
ADD COLUMN IF NOT EXISTS project_rate NUMERIC(10, 2) DEFAULT 0;

-- =====================================================
-- 2. ADD PAYMENT COLUMNS TO PROFILES (for supervisors)
-- =====================================================

-- Drop existing constraint if it exists (profiles might have it from workers)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_payment_type_check;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'hourly';

-- Add constraint after column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_payment_type_check'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_payment_type_check
    CHECK (payment_type IN ('hourly', 'daily', 'weekly', 'project_based'));
  END IF;
END $$;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10, 2) DEFAULT 0;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS daily_rate NUMERIC(10, 2) DEFAULT 0;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS weekly_salary NUMERIC(10, 2) DEFAULT 0;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS project_rate NUMERIC(10, 2) DEFAULT 0;

-- =====================================================
-- 3. CREATE SUPERVISOR_TIME_TRACKING TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.supervisor_time_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  clock_in TIMESTAMP WITH TIME ZONE NOT NULL,
  clock_out TIMESTAMP WITH TIME ZONE,
  break_start TIMESTAMP WITH TIME ZONE,
  break_end TIMESTAMP WITH TIME ZONE,
  location_lat NUMERIC(9, 6),
  location_lng NUMERIC(9, 6),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_supervisor_time_tracking_supervisor_id
  ON public.supervisor_time_tracking(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_time_tracking_project_id
  ON public.supervisor_time_tracking(project_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_time_tracking_clock_in
  ON public.supervisor_time_tracking(clock_in);

-- Enable RLS
ALTER TABLE public.supervisor_time_tracking ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. RLS POLICIES FOR SUPERVISOR_TIME_TRACKING
-- =====================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Supervisors can manage their own time tracking" ON public.supervisor_time_tracking;
DROP POLICY IF EXISTS "Owners can view supervisor time tracking" ON public.supervisor_time_tracking;

-- Supervisors can manage their own time tracking
CREATE POLICY "Supervisors can manage their own time tracking"
ON public.supervisor_time_tracking FOR ALL
USING (supervisor_id = auth.uid());

-- Owners can view their supervisors' time tracking
CREATE POLICY "Owners can view supervisor time tracking"
ON public.supervisor_time_tracking FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = supervisor_time_tracking.supervisor_id
    AND profiles.owner_id = auth.uid()
  )
);

-- =====================================================
-- 5. UPDATE ACCEPT_SUPERVISOR_INVITE FUNCTION
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

  -- Update the user's profile to be a supervisor with payment info
  UPDATE profiles
  SET role = 'supervisor',
      owner_id = v_invite.owner_id,
      payment_type = COALESCE(v_invite.payment_type, 'hourly'),
      hourly_rate = COALESCE(v_invite.hourly_rate, 0),
      daily_rate = COALESCE(v_invite.daily_rate, 0),
      weekly_salary = COALESCE(v_invite.weekly_salary, 0),
      project_rate = COALESCE(v_invite.project_rate, 0)
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
-- 6. PROJECT_TRANSACTIONS RLS FOR SUPERVISORS
-- =====================================================

-- Allow supervisors to insert labor cost transactions for their own projects
DROP POLICY IF EXISTS "Supervisors can insert transactions for own projects" ON public.project_transactions;
CREATE POLICY "Supervisors can insert transactions for own projects"
ON public.project_transactions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = project_transactions.project_id
    AND projects.user_id = auth.uid()
  )
);

-- =====================================================
-- 7. COMMENTS
-- =====================================================

COMMENT ON TABLE public.supervisor_time_tracking IS 'Time tracking records for supervisors (clock-in/out)';
COMMENT ON COLUMN public.supervisor_invites.payment_type IS 'Payment structure: hourly, daily, weekly, or project_based';
COMMENT ON COLUMN public.profiles.payment_type IS 'Payment structure for supervisors';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
