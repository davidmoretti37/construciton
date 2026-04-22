-- Make project transaction category effectively required, tied to a project phase.
-- Existing rows untouched (NOT VALID); new inserts/updates must satisfy the CHECK.
--
-- Why dual signal (phase_id OR subcategory): keeps existing Budget Breakdown
-- string-match path working while we migrate callers to the FK over time.
ALTER TABLE public.project_transactions
  ADD COLUMN IF NOT EXISTS phase_id UUID
    REFERENCES public.project_phases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_transactions_phase
  ON public.project_transactions(phase_id)
  WHERE phase_id IS NOT NULL;

ALTER TABLE public.project_transactions
  DROP CONSTRAINT IF EXISTS tx_phase_required;
ALTER TABLE public.project_transactions
  ADD CONSTRAINT tx_phase_required
  CHECK (
    type = 'income'
    OR (subcategory IS NOT NULL AND length(trim(subcategory)) > 0)
    OR phase_id IS NOT NULL
  ) NOT VALID;

NOTIFY pgrst, 'reload schema';
