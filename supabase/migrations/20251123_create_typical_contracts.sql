-- ============================================================
-- TYPICAL CONTRACTS TABLE
-- ============================================================
-- Stores user's typical/template contracts for quick project setup
-- Users can define their standard contract types during onboarding
-- and manage them in settings

CREATE TABLE IF NOT EXISTS public.typical_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL, -- e.g., "Standard Residential", "Commercial Fixed", "Time & Materials"
  description TEXT, -- Optional description of when to use this contract
  base_contract TEXT NOT NULL, -- 'fixed', 'time_materials', 'cost_plus'
  contract_amount NUMERIC(10, 2), -- Default amount for fixed contracts
  is_active BOOLEAN DEFAULT true,
  order_index INTEGER DEFAULT 0, -- For user-defined ordering
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Index for fast lookup by user
CREATE INDEX idx_typical_contracts_user ON public.typical_contracts(user_id);
CREATE INDEX idx_typical_contracts_order ON public.typical_contracts(user_id, order_index);

-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

ALTER TABLE public.typical_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own typical contracts"
  ON public.typical_contracts
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own typical contracts"
  ON public.typical_contracts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own typical contracts"
  ON public.typical_contracts
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own typical contracts"
  ON public.typical_contracts
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER on_typical_contract_updated
  BEFORE UPDATE ON public.typical_contracts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
