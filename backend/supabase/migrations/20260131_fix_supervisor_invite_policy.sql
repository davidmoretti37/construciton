-- =====================================================
-- Fix Supervisor Invites RLS Policy
-- =====================================================
-- Problem: Policy uses SELECT from auth.users which users can't access
-- Solution: Use auth.jwt() to get email from JWT token
-- Created: 2026-01-31
-- =====================================================

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view pending invites by email" ON public.supervisor_invites;

-- Create fixed policy using JWT email
CREATE POLICY "Users can view pending invites by email"
ON public.supervisor_invites FOR SELECT
USING (
  status = 'pending'
  AND LOWER(email) = LOWER(auth.jwt() ->> 'email')
);

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Run this in Supabase SQL Editor to fix the permission error
-- =====================================================
