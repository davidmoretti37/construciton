-- =====================================================
-- ALLOW WORKERS TO UPDATE PHASE TASKS
-- Created: 2025-11-25
-- Purpose: Let workers update task progress on projects they're assigned to
-- =====================================================

-- Workers can update phases on projects they're assigned to
CREATE POLICY "Workers can update assigned project phases"
ON project_phases FOR UPDATE
TO authenticated
USING (
  project_id IN (
    SELECT pa.project_id
    FROM project_assignments pa
    INNER JOIN workers w ON w.id = pa.worker_id
    WHERE w.user_id = auth.uid()
  )
)
WITH CHECK (
  project_id IN (
    SELECT pa.project_id
    FROM project_assignments pa
    INNER JOIN workers w ON w.id = pa.worker_id
    WHERE w.user_id = auth.uid()
  )
);

-- Workers can read phases on projects they're assigned to
CREATE POLICY "Workers can view assigned project phases"
ON project_phases FOR SELECT
TO authenticated
USING (
  project_id IN (
    SELECT pa.project_id
    FROM project_assignments pa
    INNER JOIN workers w ON w.id = pa.worker_id
    WHERE w.user_id = auth.uid()
  )
  OR
  project_id IN (
    SELECT id FROM projects WHERE user_id = auth.uid()
  )
);
