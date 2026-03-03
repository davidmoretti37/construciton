-- Allow workers to view ALL daily reports for projects they are assigned to
CREATE POLICY "Workers can view reports of assigned projects"
ON daily_reports FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM project_assignments pa
    JOIN workers w ON w.id = pa.worker_id
    WHERE pa.project_id = daily_reports.project_id
    AND w.user_id = auth.uid()
  )
);
