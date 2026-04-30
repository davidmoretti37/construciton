-- v1.5 sub-module schema: engagement dates, doc visibility, sub tasks.
-- All additive, no breaking changes.

-- ─── Phase 1a: engagement scheduled dates ────────────────────────────────
ALTER TABLE sub_engagements
  ADD COLUMN IF NOT EXISTS mobilization_date date,
  ADD COLUMN IF NOT EXISTS completion_target_date date;

-- ─── Phase 3a: project_documents visibility flags ────────────────────────
-- visible_to_workers already exists per 20260122_add_document_visibility.sql.
ALTER TABLE project_documents
  ADD COLUMN IF NOT EXISTS visible_to_subs    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visible_to_clients boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_important       boolean NOT NULL DEFAULT false;

-- Sub can read project docs flagged visible_to_subs IF they have an active
-- engagement on the project. Mirrors the existing worker visibility policy.
DROP POLICY IF EXISTS project_documents_sub_read ON project_documents;
CREATE POLICY project_documents_sub_read
  ON project_documents
  FOR SELECT
  USING (
    visible_to_subs = true
    AND EXISTS (
      SELECT 1 FROM sub_engagements e
      JOIN sub_organizations so ON so.id = e.sub_organization_id
      WHERE e.project_id = project_documents.project_id
        AND so.auth_user_id = (SELECT auth.uid())
        AND e.status NOT IN ('cancelled')
    )
  );

-- ─── Phase 3a: compliance_documents engagement link ──────────────────────
ALTER TABLE compliance_documents
  ADD COLUMN IF NOT EXISTS sub_engagement_id uuid REFERENCES sub_engagements(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_compliance_engagement ON compliance_documents(sub_engagement_id);

-- ─── Phase 4a: worker_tasks polymorphic assignment ───────────────────────
ALTER TABLE worker_tasks
  ADD COLUMN IF NOT EXISTS sub_organization_id uuid REFERENCES sub_organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sub_engagement_id   uuid REFERENCES sub_engagements(id)    ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_worker_tasks_sub_org    ON worker_tasks(sub_organization_id);
CREATE INDEX IF NOT EXISTS idx_worker_tasks_sub_eng    ON worker_tasks(sub_engagement_id);

-- Sub can read tasks assigned to them (via their engagement).
DROP POLICY IF EXISTS worker_tasks_sub_read ON worker_tasks;
CREATE POLICY worker_tasks_sub_read
  ON worker_tasks
  FOR SELECT
  USING (
    sub_organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM sub_organizations so
      WHERE so.id = worker_tasks.sub_organization_id
        AND so.auth_user_id = (SELECT auth.uid())
    )
  );

-- Sub can mark their own tasks complete (UPDATE status only — server enforces).
DROP POLICY IF EXISTS worker_tasks_sub_update ON worker_tasks;
CREATE POLICY worker_tasks_sub_update
  ON worker_tasks
  FOR UPDATE
  USING (
    sub_organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM sub_organizations so
      WHERE so.id = worker_tasks.sub_organization_id
        AND so.auth_user_id = (SELECT auth.uid())
    )
  );
