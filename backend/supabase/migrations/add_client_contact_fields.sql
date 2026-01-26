-- Add client contact fields to projects table
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS client_phone TEXT,
  ADD COLUMN IF NOT EXISTS client_email TEXT;

-- Add index for searching by phone/email
CREATE INDEX IF NOT EXISTS idx_projects_client_phone ON projects(client_phone);
CREATE INDEX IF NOT EXISTS idx_projects_client_email ON projects(client_email);

-- Add comments
COMMENT ON COLUMN projects.client_phone IS 'Client phone number for contact';
COMMENT ON COLUMN projects.client_email IS 'Client email address for contact';
