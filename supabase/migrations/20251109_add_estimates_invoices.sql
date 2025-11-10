-- =====================================================
-- ESTIMATES & INVOICES SYSTEM
-- Created: 2025-11-09
-- Purpose: Enable AI-powered estimate creation and invoice generation
-- =====================================================

-- =====================================================
-- ESTIMATES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Client Information
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  client_address TEXT,

  -- Estimate Details
  estimate_number TEXT UNIQUE, -- Auto-generated: EST-2025-001
  project_name TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{description, quantity, unit, pricePerUnit, total}]

  -- Pricing
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5, 2) DEFAULT 0,
  tax_amount NUMERIC(10, 2) DEFAULT 0,
  total NUMERIC(10, 2) NOT NULL DEFAULT 0,

  -- Terms & Notes
  valid_until DATE,
  payment_terms TEXT DEFAULT 'Net 30',
  notes TEXT,

  -- Status Tracking
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired')),
  sent_date TIMESTAMPTZ,
  viewed_date TIMESTAMPTZ,
  accepted_date TIMESTAMPTZ,
  rejected_date TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_estimates_user_id ON public.estimates(user_id);
CREATE INDEX idx_estimates_status ON public.estimates(status);
CREATE INDEX idx_estimates_estimate_number ON public.estimates(estimate_number);
CREATE INDEX idx_estimates_created_at ON public.estimates(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own estimates
CREATE POLICY "Users can view own estimates"
  ON public.estimates FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own estimates"
  ON public.estimates FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own estimates"
  ON public.estimates FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own estimates"
  ON public.estimates FOR DELETE
  USING (user_id = auth.uid());

-- =====================================================
-- INVOICES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  estimate_id UUID REFERENCES public.estimates(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,

  -- Client Information
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  client_address TEXT,

  -- Invoice Details
  invoice_number TEXT UNIQUE NOT NULL, -- Auto-generated: INV-2025-001
  project_name TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb, -- Same structure as estimates

  -- Pricing
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5, 2) DEFAULT 0,
  tax_amount NUMERIC(10, 2) DEFAULT 0,
  total NUMERIC(10, 2) NOT NULL DEFAULT 0,

  -- Payment Terms
  due_date DATE NOT NULL,
  payment_terms TEXT DEFAULT 'Net 30',
  notes TEXT,

  -- Payment Tracking
  amount_paid NUMERIC(10, 2) DEFAULT 0,
  amount_due NUMERIC(10, 2) GENERATED ALWAYS AS (total - amount_paid) STORED,

  -- Status
  status TEXT DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid', 'overdue', 'cancelled')),
  payment_method TEXT,
  paid_date TIMESTAMPTZ,

  -- PDF Storage
  pdf_url TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_invoices_user_id ON public.invoices(user_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_invoice_number ON public.invoices(invoice_number);
CREATE INDEX idx_invoices_due_date ON public.invoices(due_date);
CREATE INDEX idx_invoices_created_at ON public.invoices(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own invoices
CREATE POLICY "Users can view own invoices"
  ON public.invoices FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own invoices"
  ON public.invoices FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own invoices"
  ON public.invoices FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own invoices"
  ON public.invoices FOR DELETE
  USING (user_id = auth.uid());

-- =====================================================
-- AUTO-INCREMENT FUNCTIONS FOR ESTIMATE NUMBERS
-- =====================================================
CREATE OR REPLACE FUNCTION generate_estimate_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  next_num INTEGER;
  year TEXT;
BEGIN
  year := TO_CHAR(NOW(), 'YYYY');

  -- Find highest number for current year
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(estimate_number FROM 'EST-' || year || '-([0-9]+)') AS INTEGER)
  ), 0) + 1
  INTO next_num
  FROM public.estimates
  WHERE estimate_number LIKE 'EST-' || year || '-%';

  RETURN 'EST-' || year || '-' || LPAD(next_num::TEXT, 3, '0');
END;
$$;

-- Trigger function to auto-set estimate number
CREATE OR REPLACE FUNCTION set_estimate_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.estimate_number IS NULL THEN
    NEW.estimate_number := generate_estimate_number();
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger to call the function before insert
CREATE TRIGGER trigger_set_estimate_number
  BEFORE INSERT ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION set_estimate_number();

-- =====================================================
-- AUTO-INCREMENT FUNCTIONS FOR INVOICE NUMBERS
-- =====================================================
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  next_num INTEGER;
  year TEXT;
BEGIN
  year := TO_CHAR(NOW(), 'YYYY');

  -- Find highest number for current year
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(invoice_number FROM 'INV-' || year || '-([0-9]+)') AS INTEGER)
  ), 0) + 1
  INTO next_num
  FROM public.invoices
  WHERE invoice_number LIKE 'INV-' || year || '-%';

  RETURN 'INV-' || year || '-' || LPAD(next_num::TEXT, 3, '0');
END;
$$;

-- Trigger function to auto-set invoice number
CREATE OR REPLACE FUNCTION set_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger to call the function before insert
CREATE TRIGGER trigger_set_invoice_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION set_invoice_number();

-- =====================================================
-- UPDATED_AT TRIGGERS
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_estimates_updated_at
  BEFORE UPDATE ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================
COMMENT ON TABLE public.estimates IS 'Stores project estimates created by contractors';
COMMENT ON TABLE public.invoices IS 'Stores invoices generated from estimates or standalone';
COMMENT ON COLUMN public.estimates.items IS 'Array of line items: [{description, quantity, unit, pricePerUnit, total}]';
COMMENT ON COLUMN public.invoices.items IS 'Array of line items: [{description, quantity, unit, pricePerUnit, total}]';
COMMENT ON COLUMN public.invoices.amount_due IS 'Auto-calculated: total - amount_paid';
