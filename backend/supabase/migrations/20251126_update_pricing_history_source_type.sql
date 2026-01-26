-- Update pricing_history source_type constraint to allow 'onboarding'
-- This enables seeding pricing history from user's initial pricing setup

-- Drop existing constraint
ALTER TABLE pricing_history
DROP CONSTRAINT IF EXISTS pricing_history_source_type_check;

-- Add updated constraint with 'onboarding' option
ALTER TABLE pricing_history
ADD CONSTRAINT pricing_history_source_type_check
CHECK (source_type IN ('project', 'estimate', 'invoice', 'correction', 'onboarding'));

-- Add comment for documentation
COMMENT ON COLUMN pricing_history.source_type IS 'Source of pricing data: project (completed), estimate, invoice, correction (owner-edited), onboarding (initial setup)';
