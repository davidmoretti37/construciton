-- Add tax_category column to project_transactions
ALTER TABLE project_transactions
ADD COLUMN IF NOT EXISTS tax_category TEXT;

-- Create recurring_expenses table
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  category TEXT DEFAULT 'misc',
  tax_category TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
  next_due_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies for recurring_expenses
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own recurring expenses"
  ON recurring_expenses
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_user_active
  ON recurring_expenses(user_id, is_active, next_due_date);

CREATE INDEX IF NOT EXISTS idx_project_transactions_tax_category
  ON project_transactions(tax_category)
  WHERE tax_category IS NOT NULL;
