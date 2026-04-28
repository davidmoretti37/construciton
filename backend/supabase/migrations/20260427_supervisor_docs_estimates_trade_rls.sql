-- =====================================================
-- Supervisor RLS for project documents, trade budgets, and estimates
-- =====================================================
-- Without these policies a supervisor on an assigned project saw none of
-- the docs the owner uploaded, none of the estimates linked to the project,
-- and could not add trade budgets even though the UI was about to allow it.
-- All three tables previously only had owner-side `auth.uid() = user_id`
-- policies; this adds a parallel supervisor path keyed off
-- `projects.assigned_supervisor_id = auth.uid()`.
-- =====================================================

DROP POLICY IF EXISTS project_documents_supervisor ON public.project_documents;
CREATE POLICY project_documents_supervisor
  ON public.project_documents
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_documents.project_id
        AND p.assigned_supervisor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_documents.project_id
        AND p.assigned_supervisor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS trade_budgets_supervisor ON public.project_trade_budgets;
CREATE POLICY trade_budgets_supervisor
  ON public.project_trade_budgets
  FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE assigned_supervisor_id = auth.uid()
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects WHERE assigned_supervisor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS estimates_supervisor_read ON public.estimates;
CREATE POLICY estimates_supervisor_read
  ON public.estimates
  FOR SELECT
  USING (
    project_id IS NOT NULL
    AND project_id IN (
      SELECT id FROM projects WHERE assigned_supervisor_id = auth.uid()
    )
  );
