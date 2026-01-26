-- Add budget column to project_phases table to store phase-specific budgets
ALTER TABLE project_phases
ADD COLUMN IF NOT EXISTS budget NUMERIC(10, 2) DEFAULT 0;

-- Add services column to project_phases table to store line items/services per phase
ALTER TABLE project_phases
ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '[]'::jsonb;

-- Add comment to document the columns
COMMENT ON COLUMN project_phases.budget IS 'Budget allocated for this phase from the estimate';
COMMENT ON COLUMN project_phases.services IS 'Line items/services associated with this phase from the estimate';
