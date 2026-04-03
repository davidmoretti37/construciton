-- Per-trade budget tracking within projects
-- Allows owners to set budget per trade (Electrical, Plumbing, etc.)
-- and track payments against each budget

CREATE TABLE IF NOT EXISTS project_trade_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  trade_name TEXT NOT NULL,
  budget_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_trade_budgets_project ON project_trade_budgets(project_id);

-- RLS
ALTER TABLE project_trade_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY trade_budgets_owner ON project_trade_budgets
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );
