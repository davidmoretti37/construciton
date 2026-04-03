-- Add audit trail columns to invoices and estimates
-- Tracks who last modified each record

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

-- Ensure updated_at exists and has a default
ALTER TABLE invoices ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE estimates ALTER COLUMN updated_at SET DEFAULT now();
