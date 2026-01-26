-- Create contracts table
CREATE TABLE IF NOT EXISTS public.contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT,
  content TEXT,
  status TEXT DEFAULT 'draft', -- draft, pending, signed, rejected
  value DECIMAL(10, 2),
  signed_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create contract_templates table
CREATE TABLE IF NOT EXISTS public.contract_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create invoice_template table (for customization settings)
CREATE TABLE IF NOT EXISTS public.invoice_template (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logo_url TEXT,
  business_name TEXT,
  business_address TEXT,
  business_phone TEXT,
  business_email TEXT,
  payment_terms TEXT DEFAULT 'Net 30',
  footer_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_template ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contracts
CREATE POLICY "Users can view their own contracts"
  ON public.contracts
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own contracts"
  ON public.contracts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own contracts"
  ON public.contracts
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own contracts"
  ON public.contracts
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for contract_templates
CREATE POLICY "Users can view their own contract templates"
  ON public.contract_templates
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own contract templates"
  ON public.contract_templates
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own contract templates"
  ON public.contract_templates
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own contract templates"
  ON public.contract_templates
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for invoice_template
CREATE POLICY "Users can view their own invoice template"
  ON public.invoice_template
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own invoice template"
  ON public.invoice_template
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own invoice template"
  ON public.invoice_template
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own invoice template"
  ON public.invoice_template
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_contracts_user_id ON public.contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_contracts_project_id ON public.contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON public.contracts(status);
CREATE INDEX IF NOT EXISTS idx_contract_templates_user_id ON public.contract_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_contract_templates_is_default ON public.contract_templates(is_default);
CREATE INDEX IF NOT EXISTS idx_invoice_template_user_id ON public.invoice_template(user_id);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_contracts_updated_at ON public.contracts;
CREATE TRIGGER update_contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_contract_templates_updated_at ON public.contract_templates;
CREATE TRIGGER update_contract_templates_updated_at
  BEFORE UPDATE ON public.contract_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_invoice_template_updated_at ON public.invoice_template;
CREATE TRIGGER update_invoice_template_updated_at
  BEFORE UPDATE ON public.invoice_template
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
