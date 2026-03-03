-- Allow workers to view and update tasks on projects they're assigned to
-- This enables workers to see Additional Tasks and mark them as completed

-- Workers can view tasks of projects they're assigned to
CREATE POLICY "Workers can view tasks of assigned projects"
ON worker_tasks FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM project_assignments pa
    JOIN workers w ON w.id = pa.worker_id
    WHERE pa.project_id = worker_tasks.project_id
    AND w.user_id = auth.uid()
  )
);

-- Workers can update tasks of projects they're assigned to (to mark complete)
CREATE POLICY "Workers can update tasks of assigned projects"
ON worker_tasks FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM project_assignments pa
    JOIN workers w ON w.id = pa.worker_id
    WHERE pa.project_id = worker_tasks.project_id
    AND w.user_id = auth.uid()
  )
);
