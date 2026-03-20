-- Elite Classification: allow unknown transactions + worker payment linking
-- ============================================================

-- 1. Allow NULL transaction_type on bank_transactions (NULL = unknown/unclassified)
ALTER TABLE bank_transactions ALTER COLUMN transaction_type DROP NOT NULL;

-- 2. Add worker_id to bank_transactions for detected worker payments
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS worker_id UUID REFERENCES workers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_worker ON bank_transactions(worker_id)
  WHERE worker_id IS NOT NULL;

-- 3. Add split_group_id to group auto-split transactions for editing
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS split_group_id UUID;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_split_group ON bank_transactions(split_group_id)
  WHERE split_group_id IS NOT NULL;
