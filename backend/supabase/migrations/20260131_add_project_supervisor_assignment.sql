-- Migration: Add project supervisor assignment
-- Allows owners to assign their projects to supervisors to manage
-- user_id = original creator, assigned_supervisor_id = delegated manager

-- Add assigned_supervisor_id column to projects
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS assigned_supervisor_id UUID REFERENCES auth.users(id);

-- Add index for faster queries on assigned projects
CREATE INDEX IF NOT EXISTS idx_projects_assigned_supervisor
ON projects(assigned_supervisor_id) WHERE assigned_supervisor_id IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN projects.assigned_supervisor_id IS
'Supervisor assigned to manage this project. NULL means owner manages directly.
user_id = creator/owner, assigned_supervisor_id = delegated manager.';

-- RLS Policy: Allow supervisors to view projects assigned to them
CREATE POLICY "Supervisors can view assigned projects"
ON projects FOR SELECT
USING (assigned_supervisor_id = auth.uid());

-- RLS Policy: Allow supervisors to update projects assigned to them
-- (They can manage but not change ownership or reassign)
CREATE POLICY "Supervisors can update assigned projects"
ON projects FOR UPDATE
USING (assigned_supervisor_id = auth.uid())
WITH CHECK (assigned_supervisor_id = auth.uid());

-- Function to assign a project to a supervisor (with validation)
CREATE OR REPLACE FUNCTION assign_project_to_supervisor(
  p_project_id UUID,
  p_supervisor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id UUID;
  v_project_owner_id UUID;
  v_supervisor_valid BOOLEAN;
BEGIN
  -- Get current user
  v_owner_id := auth.uid();

  -- Check if project belongs to this owner
  SELECT user_id INTO v_project_owner_id
  FROM projects
  WHERE id = p_project_id;

  IF v_project_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Project not found');
  END IF;

  IF v_project_owner_id != v_owner_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'You do not own this project');
  END IF;

  -- If supervisor_id is null, we're unassigning
  IF p_supervisor_id IS NULL THEN
    UPDATE projects SET assigned_supervisor_id = NULL WHERE id = p_project_id;
    RETURN jsonb_build_object('success', true, 'action', 'unassigned');
  END IF;

  -- Validate supervisor belongs to this owner
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_supervisor_id
    AND owner_id = v_owner_id
    AND role = 'supervisor'
  ) INTO v_supervisor_valid;

  IF NOT v_supervisor_valid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid supervisor - must be your supervisor');
  END IF;

  -- Assign the project
  UPDATE projects
  SET assigned_supervisor_id = p_supervisor_id
  WHERE id = p_project_id;

  RETURN jsonb_build_object('success', true, 'action', 'assigned', 'supervisor_id', p_supervisor_id);
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION assign_project_to_supervisor(UUID, UUID) TO authenticated;

-- Trigger: When supervisor is removed from owner, unassign their projects
CREATE OR REPLACE FUNCTION unassign_removed_supervisor_projects()
RETURNS TRIGGER AS $$
BEGIN
  -- If supervisor's owner_id is being set to NULL (removed from company)
  IF OLD.owner_id IS NOT NULL AND NEW.owner_id IS NULL AND OLD.role = 'supervisor' THEN
    UPDATE projects
    SET assigned_supervisor_id = NULL
    WHERE assigned_supervisor_id = OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on profiles table
DROP TRIGGER IF EXISTS trigger_unassign_removed_supervisor ON profiles;
CREATE TRIGGER trigger_unassign_removed_supervisor
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION unassign_removed_supervisor_projects();

-- RLS policies for related tables (supervisors need access to assigned project data)

-- project_phases: Supervisors can view phases of assigned projects
CREATE POLICY "Supervisors can view phases of assigned projects"
ON project_phases FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = project_phases.project_id
    AND projects.assigned_supervisor_id = auth.uid()
  )
);

-- project_phases: Supervisors can update phases of assigned projects
CREATE POLICY "Supervisors can update phases of assigned projects"
ON project_phases FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = project_phases.project_id
    AND projects.assigned_supervisor_id = auth.uid()
  )
);

-- worker_tasks: Supervisors can view tasks of assigned projects
CREATE POLICY "Supervisors can view tasks of assigned projects"
ON worker_tasks FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = worker_tasks.project_id
    AND projects.assigned_supervisor_id = auth.uid()
  )
);

-- worker_tasks: Supervisors can manage tasks of assigned projects
CREATE POLICY "Supervisors can manage tasks of assigned projects"
ON worker_tasks FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = worker_tasks.project_id
    AND projects.assigned_supervisor_id = auth.uid()
  )
);

-- project_transactions: Supervisors can view transactions of assigned projects
CREATE POLICY "Supervisors can view transactions of assigned projects"
ON project_transactions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = project_transactions.project_id
    AND projects.assigned_supervisor_id = auth.uid()
  )
);

-- daily_reports: Supervisors can view reports of assigned projects
CREATE POLICY "Supervisors can view reports of assigned projects"
ON daily_reports FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = daily_reports.project_id
    AND projects.assigned_supervisor_id = auth.uid()
  )
);
