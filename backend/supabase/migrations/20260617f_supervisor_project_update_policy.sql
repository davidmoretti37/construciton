-- =====================================================
-- Allow supervisors with can_create_projects to UPDATE projects
-- =====================================================
-- Background: the only write policy on public.projects is `projects_owner_write`
-- (FOR ALL, USING user_id = auth.uid()), which is owner-only. The prior
-- "Supervisors can update assigned projects" policy was dropped in the
-- 20260424b flatten and never re-added, so a supervisor who CAN create a
-- project (via supervisor_can_create_projects) silently fails to EDIT it
-- (0 rows updated).
--
-- This adds a parallel UPDATE policy mirroring the INSERT one. It is NARROW:
-- it only matches the row's *assigned* supervisor, and only when that
-- supervisor's profile is role=supervisor, linked to the project's owner
-- (profiles.owner_id = projects.user_id), and has can_create_projects=true.
--
-- SECURITY: the WITH CHECK governs the NEW row and MUST repeat the owner
-- binding (profiles.owner_id = projects.user_id), not just pin
-- assigned_supervisor_id. USING only constrains the OLD row, so without the
-- owner-binding in WITH CHECK a supervisor could UPDATE and set user_id to an
-- arbitrary value (keeping assigned_supervisor_id = auth.uid()), orphaning the
-- project away from its real owner — a privilege escalation. Mirroring the
-- INSERT policy's EXISTS clause in WITH CHECK forces the new user_id to remain
-- the supervisor's own owner, so ownership cannot be reassigned.
-- =====================================================

DROP POLICY IF EXISTS supervisor_can_update_projects ON public.projects;

CREATE POLICY supervisor_can_update_projects ON public.projects
  FOR UPDATE TO authenticated
  USING (
    projects.assigned_supervisor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'supervisor'
        AND profiles.owner_id = projects.user_id
        AND profiles.can_create_projects = true
    )
  )
  WITH CHECK (
    projects.assigned_supervisor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'supervisor'
        AND profiles.owner_id = projects.user_id
        AND profiles.can_create_projects = true
    )
  );
