-- Link bank transactions to overhead recurring expenses
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS overhead_expense_id UUID REFERENCES recurring_expenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_overhead ON bank_transactions(overhead_expense_id)
  WHERE overhead_expense_id IS NOT NULL;
