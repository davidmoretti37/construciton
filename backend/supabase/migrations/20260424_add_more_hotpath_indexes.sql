-- Statement-timeout (57014) errors were still firing on ProjectDetailView
-- open after 20260422 landed. project_documents had no index on project_id;
-- project_assignments is already indexed (idx_project_assignments_project_id
-- from 20251103) so no change needed there.
--
-- Safe to re-run: CREATE INDEX uses IF NOT EXISTS. Finishes in well under a
-- second at current table size. If the table has grown much larger by the
-- time this runs, apply via the Supabase SQL Editor using CREATE INDEX
-- CONCURRENTLY (which must run outside a transaction).

-- project_documents: fetchProjectDocuments filters on project_id. Other
-- indexes exist (visibility, service_plan_id) but not this one.
CREATE INDEX IF NOT EXISTS idx_project_documents_project_id
  ON public.project_documents(project_id);
