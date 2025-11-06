-- Fix all existing draft projects to be active
-- Run this ONCE in your Supabase SQL Editor to update existing data

-- Update all draft projects to active
UPDATE public.projects
SET status = 'active'
WHERE status = 'draft';

-- Show how many were updated
SELECT
  COUNT(*) as total_updated,
  'Projects changed from draft to active' as message
FROM public.projects
WHERE status = 'active';
