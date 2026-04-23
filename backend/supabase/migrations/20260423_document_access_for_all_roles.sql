-- Unify document access for owners, supervisors, and workers.
-- Before this migration:
--   * project_documents row RLS only allowed owners + the uploader.
--   * project-docs / project-documents storage RLS only allowed the user
--     whose auth.uid() matched the first folder of the path (the uploader).
-- Result: any non-owner tap on a document row returned "Could not load
-- document." because storage.createSignedUrl was rejected.
--
-- After: supervisors assigned to a project see all its documents;
-- workers assigned see documents flagged visible_to_workers; and anyone
-- allowed to see the row can also fetch a signed URL for the file.
--
-- Safe to re-run.

-- ── 1. project_documents row RLS ────────────────────────────────────────
-- Replace the single owner-only policy with separate per-role policies so
-- the matrix is explicit. Existing owners keep full access.

DROP POLICY IF EXISTS project_documents_owner ON public.project_documents;

-- Owner / uploader: full access (original behaviour, minus the non-owner
-- uploaded_by escape hatch which doesn't apply once we grant per-role
-- access below).
DROP POLICY IF EXISTS "project_documents owner full access" ON public.project_documents;
CREATE POLICY "project_documents owner full access" ON public.project_documents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_documents.project_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.service_plans sp
      WHERE sp.id = project_documents.service_plan_id AND sp.owner_id = auth.uid()
    )
    OR uploaded_by = auth.uid()
  );

-- Supervisor: read any document for a project they're assigned to.
DROP POLICY IF EXISTS "project_documents supervisor read" ON public.project_documents;
CREATE POLICY "project_documents supervisor read" ON public.project_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_documents.project_id
        AND p.assigned_supervisor_id = auth.uid()
    )
  );

-- Worker: read documents flagged visible_to_workers on projects /
-- service plans they're assigned to. SECURITY DEFINER helper keeps the
-- join from recursing through projects RLS.
CREATE OR REPLACE FUNCTION public.current_worker_can_see_document(
  p_project_id uuid,
  p_service_plan_id uuid,
  p_visible_to_workers boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT p_visible_to_workers THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.project_assignments pa
      JOIN public.workers w ON w.id = pa.worker_id
      WHERE w.user_id = auth.uid()
        AND (
          (p_project_id IS NOT NULL AND pa.project_id = p_project_id)
          OR (p_service_plan_id IS NOT NULL AND pa.service_plan_id = p_service_plan_id)
        )
    )
  END;
$$;
REVOKE ALL ON FUNCTION public.current_worker_can_see_document(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_worker_can_see_document(uuid, uuid, boolean) TO authenticated, anon;

DROP POLICY IF EXISTS "project_documents worker read" ON public.project_documents;
CREATE POLICY "project_documents worker read" ON public.project_documents
  FOR SELECT USING (
    public.current_worker_can_see_document(project_id, service_plan_id, visible_to_workers)
  );

-- ── 2. Storage RLS ──────────────────────────────────────────────────────
-- Grant SELECT on storage.objects when the caller can see a
-- project_documents row whose file_url matches the object's name. The
-- inner SELECT is automatically filtered by the per-role project_documents
-- policies above, so this single policy covers owners, supervisors, and
-- permitted workers without duplicating the access matrix.

DROP POLICY IF EXISTS "project-docs member read" ON storage.objects;
CREATE POLICY "project-docs member read" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-docs'
    AND EXISTS (
      SELECT 1 FROM public.project_documents pd
      WHERE pd.file_url = storage.objects.name
         OR pd.file_url LIKE '%' || storage.objects.name
    )
  );

-- Legacy bucket — same treatment so documents uploaded before the
-- `project-docs` bucket existed can also be opened by non-owners.
DROP POLICY IF EXISTS "project-documents member read" ON storage.objects;
CREATE POLICY "project-documents member read" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-documents'
    AND EXISTS (
      SELECT 1 FROM public.project_documents pd
      WHERE pd.file_url = storage.objects.name
         OR pd.file_url LIKE '%' || storage.objects.name
    )
  );

-- ── 3. Daily checklist templates — worker/supervisor read ────────────
-- Workers need to see the list of recurring crew-check items so their
-- project card can show a unified "Today · N items" count that includes
-- daily checks alongside phase tasks. Supervisors assigned to the
-- project need the same visibility.
DROP POLICY IF EXISTS checklist_templates_assigned_read ON public.daily_checklist_templates;
CREATE POLICY checklist_templates_assigned_read ON public.daily_checklist_templates
  FOR SELECT USING (
    -- Supervisor of the project
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = daily_checklist_templates.project_id
        AND p.assigned_supervisor_id = auth.uid()
    )
    -- Worker assigned to the project or service plan
    OR EXISTS (
      SELECT 1
      FROM public.project_assignments pa
      JOIN public.workers w ON w.id = pa.worker_id
      WHERE w.user_id = auth.uid()
        AND (
          (daily_checklist_templates.project_id IS NOT NULL
            AND pa.project_id = daily_checklist_templates.project_id)
          OR (daily_checklist_templates.service_plan_id IS NOT NULL
            AND pa.service_plan_id = daily_checklist_templates.service_plan_id)
        )
    )
  );

-- Daily service reports — workers/supervisors read-access so they can see
-- what's been submitted today (drives the "X/Y done" count).
DROP POLICY IF EXISTS service_reports_assigned_read ON public.daily_service_reports;
CREATE POLICY service_reports_assigned_read ON public.daily_service_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = daily_service_reports.project_id
        AND p.assigned_supervisor_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.project_assignments pa
      JOIN public.workers w ON w.id = pa.worker_id
      WHERE w.user_id = auth.uid()
        AND (
          (daily_service_reports.project_id IS NOT NULL
            AND pa.project_id = daily_service_reports.project_id)
          OR (daily_service_reports.service_plan_id IS NOT NULL
            AND pa.service_plan_id = daily_service_reports.service_plan_id)
        )
    )
  );

NOTIFY pgrst, 'reload schema';
