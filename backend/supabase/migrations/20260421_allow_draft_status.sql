-- Allow 'draft' status on projects table for ProjectBuilder Configure Details flow.
-- Existing constraint excluded 'draft' which broke draft row insertion.

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN ('draft', 'active', 'on-track', 'behind', 'over-budget', 'completed', 'archived'));
