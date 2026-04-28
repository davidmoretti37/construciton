-- =====================================================
-- Allow supervisors with can_create_projects to insert projects
-- =====================================================
-- Existing INSERT policy on projects only matches when user_id = auth.uid(),
-- which blocks supervisors. This adds a parallel policy so a supervisor can
-- insert a project under their owner's user_id, with themselves set as the
-- assigned supervisor — and only if their profile has can_create_projects=true.
-- =====================================================

CREATE POLICY supervisor_can_create_projects ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'supervisor'
        AND profiles.owner_id = projects.user_id
        AND profiles.can_create_projects = true
    )
    AND projects.assigned_supervisor_id = auth.uid()
  );
