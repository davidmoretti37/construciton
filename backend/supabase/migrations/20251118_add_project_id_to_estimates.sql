-- Add project_id foreign key to estimates table
-- This links estimates to their corresponding projects

ALTER TABLE estimates
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_estimates_project_id ON estimates(project_id);

-- Add comment for documentation
COMMENT ON COLUMN estimates.project_id IS 'Links estimate to a project - used to auto-update project with estimate data (phases, budget, timeline)';
