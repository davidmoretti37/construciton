-- Add client address and contact person fields to projects table for invoices
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS client_address TEXT,
  ADD COLUMN IF NOT EXISTS client_contact_person TEXT;

-- Add client contact person to invoices table
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS client_contact_person TEXT;

-- Add client contact person to estimates table
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS client_contact_person TEXT;

-- Add indexes for searching
CREATE INDEX IF NOT EXISTS idx_projects_client_address ON projects(client_address);
CREATE INDEX IF NOT EXISTS idx_projects_client_contact_person ON projects(client_contact_person);
CREATE INDEX IF NOT EXISTS idx_invoices_client_contact_person ON invoices(client_contact_person);
CREATE INDEX IF NOT EXISTS idx_estimates_client_contact_person ON estimates(client_contact_person);

-- Add comments
COMMENT ON COLUMN projects.client_address IS 'Client business address for invoices (Bill To section)';
COMMENT ON COLUMN projects.client_contact_person IS 'Client contact person name for invoices (Attn: line)';
COMMENT ON COLUMN invoices.client_contact_person IS 'Client contact person name (Attn: line)';
COMMENT ON COLUMN estimates.client_contact_person IS 'Client contact person name (Attn: line)';
