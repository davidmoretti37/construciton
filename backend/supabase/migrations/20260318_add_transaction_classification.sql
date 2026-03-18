-- Add transaction classification columns to bank_transactions
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS transaction_type TEXT,
  ADD COLUMN IF NOT EXISTS classification_confidence TEXT DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS subcategory TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add check constraint for transaction_type
ALTER TABLE bank_transactions
  ADD CONSTRAINT chk_transaction_type CHECK (
    transaction_type IS NULL OR transaction_type IN ('expense', 'income', 'transfer')
  );

-- Add check constraint for classification_confidence
ALTER TABLE bank_transactions
  ADD CONSTRAINT chk_classification_confidence CHECK (
    classification_confidence IN ('high', 'medium', 'low')
  );

-- Create transaction_rules table for learned classifications
CREATE TABLE IF NOT EXISTS transaction_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description_pattern TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('expense', 'income', 'transfer')),
  subcategory TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, description_pattern)
);

-- Index for fast rule lookups during sync
CREATE INDEX IF NOT EXISTS idx_transaction_rules_user ON transaction_rules(user_id);

-- Index for transaction_type queries
CREATE INDEX IF NOT EXISTS idx_bank_transactions_type ON bank_transactions(transaction_type);

-- RLS policies for transaction_rules
ALTER TABLE transaction_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own rules"
  ON transaction_rules FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rules"
  ON transaction_rules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own rules"
  ON transaction_rules FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own rules"
  ON transaction_rules FOR DELETE
  USING (auth.uid() = user_id);
