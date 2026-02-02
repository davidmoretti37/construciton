-- Add job_title column to profiles table for supervisors
-- This allows supervisors to save their job title during onboarding

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS job_title TEXT;

-- Add comment for documentation
COMMENT ON COLUMN profiles.job_title IS 'Job title for supervisor users (e.g., Project Manager, Foreman)';
