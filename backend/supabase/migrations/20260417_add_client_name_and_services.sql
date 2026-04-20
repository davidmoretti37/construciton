-- Add client_name column back to projects table (was removed in 20251115)
-- Also add services JSONB column for line items
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '[]'::jsonb;

-- Add index for searching by client name
CREATE INDEX IF NOT EXISTS idx_projects_client_name ON projects(client_name);

COMMENT ON COLUMN projects.client_name IS 'Client/customer name for this project';
COMMENT ON COLUMN projects.services IS 'Line item services with description and amount';
