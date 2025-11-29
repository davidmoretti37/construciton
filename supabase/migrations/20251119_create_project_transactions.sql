-- Create project_transactions table for itemized expense and income tracking
-- This table stores all financial transactions (expenses and income) for projects

CREATE TABLE IF NOT EXISTS public.project_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Transaction type and details
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  category TEXT, -- For expenses: 'labor', 'materials', 'equipment', 'permits', 'other'
  description TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Links for automated entries
  worker_id UUID REFERENCES public.workers(id) ON DELETE SET NULL,
  time_tracking_id UUID REFERENCES public.time_tracking(id) ON DELETE SET NULL,

  -- Payment method for income
  payment_method TEXT, -- 'cash', 'check', 'transfer', 'card', 'other'

  -- Notes and metadata
  notes TEXT,
  is_auto_generated BOOLEAN DEFAULT false, -- true for auto-calculated labor costs

  -- Audit fields
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_transactions_project_id ON public.project_transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_transactions_type ON public.project_transactions(type);
CREATE INDEX IF NOT EXISTS idx_project_transactions_date ON public.project_transactions(date);
CREATE INDEX IF NOT EXISTS idx_project_transactions_worker_id ON public.project_transactions(worker_id);
CREATE INDEX IF NOT EXISTS idx_project_transactions_time_tracking_id ON public.project_transactions(time_tracking_id);

-- Add comments
COMMENT ON TABLE public.project_transactions IS 'Stores all financial transactions (expenses and income) for projects with full history';
COMMENT ON COLUMN public.project_transactions.type IS 'Transaction type: expense or income';
COMMENT ON COLUMN public.project_transactions.category IS 'For expenses: labor, materials, equipment, permits, other';
COMMENT ON COLUMN public.project_transactions.worker_id IS 'Link to worker for labor cost expenses';
COMMENT ON COLUMN public.project_transactions.time_tracking_id IS 'Link to time tracking entry for auto-generated labor costs';
COMMENT ON COLUMN public.project_transactions.is_auto_generated IS 'True for automatically calculated labor costs from clock out';

-- Function to update project totals from transactions
CREATE OR REPLACE FUNCTION update_project_totals_from_transactions()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate project expenses and income from transaction items
  UPDATE public.projects p
  SET
    expenses = COALESCE((
      SELECT SUM(amount)
      FROM public.project_transactions
      WHERE project_id = p.id AND type = 'expense'
    ), 0),
    income_collected = COALESCE((
      SELECT SUM(amount)
      FROM public.project_transactions
      WHERE project_id = p.id AND type = 'income'
    ), 0),
    updated_at = NOW()
  WHERE p.id = COALESCE(NEW.project_id, OLD.project_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update project totals
DROP TRIGGER IF EXISTS trigger_update_project_totals ON public.project_transactions;
CREATE TRIGGER trigger_update_project_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.project_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_project_totals_from_transactions();

-- RLS Policies
ALTER TABLE public.project_transactions ENABLE ROW LEVEL SECURITY;

-- Owners can view all transactions for their projects
CREATE POLICY "Owners can view project transactions"
ON public.project_transactions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_transactions.project_id
    AND projects.user_id = auth.uid()
  )
);

-- Owners can insert transactions for their projects
CREATE POLICY "Owners can insert project transactions"
ON public.project_transactions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_transactions.project_id
    AND projects.user_id = auth.uid()
  )
);

-- Owners can update transactions for their projects
CREATE POLICY "Owners can update project transactions"
ON public.project_transactions FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_transactions.project_id
    AND projects.user_id = auth.uid()
  )
);

-- Owners can delete transactions for their projects
CREATE POLICY "Owners can delete project transactions"
ON public.project_transactions FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_transactions.project_id
    AND projects.user_id = auth.uid()
  )
);

-- Workers can view labor cost transactions related to them
CREATE POLICY "Workers can view their labor transactions"
ON public.project_transactions FOR SELECT
USING (
  type = 'expense'
  AND category = 'labor'
  AND EXISTS (
    SELECT 1 FROM public.workers
    WHERE workers.id = project_transactions.worker_id
    AND workers.user_id = auth.uid()
  )
);
