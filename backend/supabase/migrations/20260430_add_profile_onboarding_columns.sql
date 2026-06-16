-- Add onboarding tracking columns to profiles table.
-- Owned by Segment 2 (onboarding wizard). Segment 1 only adds the columns
-- so the layout-level redirect gate has fields to read.
--
-- OPERATOR TIMING CONSTRAINT: this migration MUST be applied
-- (`supabase db push`) BEFORE deploying the layout change in
-- src/app/app/layout.tsx, or the extended profile select will throw at
-- runtime.
--
-- No new RLS policies — existing `profiles` self-update RLS already covers
-- self-writes by Segment 2's wizard.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_step TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_skipped_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.onboarding_completed_at IS 'Set by onboarding wizard on completion; non-null clears the onboarding gate.';
COMMENT ON COLUMN profiles.onboarding_step IS 'Resume position for in-progress wizard (e.g., "business", "team", "review").';
COMMENT ON COLUMN profiles.onboarding_skipped_at IS 'Set when owner skips wizard; non-null also clears the onboarding gate.';
