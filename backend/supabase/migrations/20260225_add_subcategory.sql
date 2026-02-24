-- Add subcategory column for granular expense and income tracking
-- Subcategory is optional; existing rows remain NULL (fully backward-compatible)
ALTER TABLE public.project_transactions
ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- Index for efficient subcategory queries
CREATE INDEX IF NOT EXISTS idx_project_transactions_subcategory
ON public.project_transactions(subcategory);

COMMENT ON COLUMN public.project_transactions.subcategory
IS 'Optional subcategory within the parent category. For expenses: lumber, wages, rental, etc. For income: contract_payment, change_order, deposit, etc.';
