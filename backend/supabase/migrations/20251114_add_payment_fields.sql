-- =====================================================
-- ADD PAYMENT STRUCTURE FIELDS
-- Created: 2025-11-14
-- Purpose: Add payment tracking for full vs per-phase payments
-- =====================================================

-- Add payment fields to projects table
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS payment_structure TEXT DEFAULT 'full' CHECK (payment_structure IN ('full', 'per_phase')),
  ADD COLUMN IF NOT EXISTS payment_terms TEXT;

-- Add payment amount to project_phases table
ALTER TABLE project_phases
  ADD COLUMN IF NOT EXISTS payment_amount DECIMAL(12, 2);

-- Add invoice tracking to project_phases
ALTER TABLE project_phases
  ADD COLUMN IF NOT EXISTS invoiced BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

-- Add phase reference to invoices table (if it doesn't already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'phase_id'
  ) THEN
    ALTER TABLE invoices ADD COLUMN phase_id UUID REFERENCES project_phases(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add invoice type to invoices table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'invoice_type'
  ) THEN
    ALTER TABLE invoices ADD COLUMN invoice_type TEXT DEFAULT 'invoice' CHECK (invoice_type IN ('estimate', 'invoice'));
  END IF;
END $$;

-- Create index for phase invoice lookups
CREATE INDEX IF NOT EXISTS idx_project_phases_invoice ON project_phases(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_phase ON invoices(phase_id);

-- Function to validate phase payments sum to contract amount
CREATE OR REPLACE FUNCTION validate_phase_payments(p_project_id UUID)
RETURNS TABLE(is_valid BOOLEAN, total_phase_payments DECIMAL, contract_amount DECIMAL, difference DECIMAL) AS $$
DECLARE
  phase_sum DECIMAL;
  contract_amt DECIMAL;
  diff DECIMAL;
BEGIN
  -- Get contract amount
  SELECT base_contract INTO contract_amt
  FROM projects
  WHERE id = p_project_id;

  -- Get sum of phase payments
  SELECT COALESCE(SUM(payment_amount), 0) INTO phase_sum
  FROM project_phases
  WHERE project_id = p_project_id;

  -- Calculate difference
  diff := contract_amt - phase_sum;

  -- Return validation result
  RETURN QUERY SELECT
    (ABS(diff) < 0.01) AS is_valid, -- Allow for minor rounding differences
    phase_sum,
    contract_amt,
    diff;
END;
$$ LANGUAGE plpgsql;

-- Add helpful comments
COMMENT ON COLUMN projects.payment_structure IS 'Payment type: full (pay when complete) or per_phase (milestone payments)';
COMMENT ON COLUMN projects.payment_terms IS 'Payment terms (e.g., "Net 30", "Due on completion")';
COMMENT ON COLUMN project_phases.payment_amount IS 'Payment amount for this phase (only for per_phase projects)';
COMMENT ON COLUMN project_phases.invoiced IS 'Whether invoice has been generated for this phase';
COMMENT ON COLUMN project_phases.invoice_id IS 'Reference to invoice for this phase';
COMMENT ON FUNCTION validate_phase_payments IS 'Validates that phase payments sum to contract amount';
